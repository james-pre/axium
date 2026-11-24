import { getConfig } from '@axium/core';
import { database } from '@axium/server/database';
import * as jobs from '@axium/server/jobs';
import * as io from 'ioium';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type * as ai from '../common.js';
import * as disks from '../node/sandbox/disk.js';
import { buildImage, findImage, imageKey, removeTree, type Image } from '../node/sandbox/image.js';
import { guestUser } from '../node/sandbox/guest.js';
import * as vm from '../node/sandbox/vm.js';
import type * as tools from '../tools.js';

type State =
	| { status: 'off' }
	| { status: 'building'; key: string; controller: AbortController }
	| { status: 'ready'; key: string; image: Image }
	| { status: 'failed'; key: string; error: string };

let state: State = { status: 'off' };

/** How long a temporary conversation's sandbox is kept after it was last used, in milliseconds */
const temporaryLifetime = 24 * 3600_000;

/** The most bytes of a command's stdout and stderr kept for the model */
const maxCommandOutput = 256 * 1024;

/** The largest file `read` returns, in bytes */
const maxReadSize = 32 * 1024 * 1024;

/** The most files listed */
const maxListed = 1000;

function directory(...parts: string[]): string {
	return join(getConfig('@axium/ai').data_dir, 'sandbox', ...parts);
}

export function isAvailable(): boolean {
	return getConfig('@axium/ai').sandbox.enabled && state.status == 'ready';
}

/** Builds the root filesystem in the background when the sandbox is enabled and its image changed */
export async function prepare(): Promise<void> {
	const config = getConfig('@axium/ai').sandbox;

	if (!config.enabled) {
		if (state.status == 'building') state.controller.abort();
		state = { status: 'off' };
		return;
	}

	const key = imageKey(config.image, config.setup);
	if (state.status != 'off' && state.key == key) return;
	if (state.status == 'building') state.controller.abort();

	const images = directory('images');
	const existing = await findImage(images, config.image, config.setup).catch(() => undefined);
	if (existing) {
		state = { status: 'ready', key, image: existing };
		return;
	}

	const controller = new AbortController();
	state = { status: 'building', key, controller };
	io.info('AI: building the sandbox from', config.image);

	void (async () => {
		try {
			await mkdir(images, { recursive: true });
			await vm.check();
			const image = await buildImage({
				reference: config.image,
				setup: config.setup,
				dir: images,
				memory: config.memory,
				cpus: config.cpus,
				signal: controller.signal,
			});
			if (controller.signal.aborted) return;
			state = { status: 'ready', key, image };
			io.info('AI: the sandbox is ready');
		} catch (error) {
			if (controller.signal.aborted) return;
			state = { status: 'failed', key, error: io.errorText(error) };
			io.error('AI: could not build the sandbox:', io.errorText(error));
		}
	})();
}

let running = 0;
const waiting: (() => void)[] = [];

/** Waits until fewer than the configured number of VMs are running */
async function acquire(signal?: AbortSignal): Promise<void> {
	while (running >= getConfig('@axium/ai').sandbox.concurrency) {
		signal?.throwIfAborted();
		await new Promise<void>(resolve => waiting.push(resolve));
	}
	running++;
}

function release(): void {
	running--;
	waiting.shift()?.();
}

/** The work queued on each disk, which only one VM may use at a time */
const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(path: string, task: () => Promise<T>): Promise<T> {
	const previous = locks.get(path) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(task);
	locks.set(path, current);
	try {
		return await current;
	} finally {
		if (locks.get(path) == current) locks.delete(path);
	}
}

function diskPath(userId: string, conversationId: string, temporary: boolean): string {
	return directory(temporary ? 'temporary' : 'disks', userId, conversationId + '.img');
}

/** Quotes text for a POSIX shell */
function quote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}

interface ExecOptions extends Pick<vm.Options, 'stdin' | 'signal'>, Partial<Pick<vm.Options, 'network'>> {
	/** In milliseconds */
	timeout?: number;
}

function vmOptions(disk: string, command: string, options: ExecOptions): vm.Options {
	if (state.status != 'ready') throw new Error('The sandbox is not available');
	const config = getConfig('@axium/ai').sandbox;
	return {
		root: { disk: state.image.disk },
		work: disk,
		memory: config.memory,
		cpus: config.cpus,
		command,
		env: state.image.env,
		network: options.network ?? 'none',
		stdin: options.stdin,
		timeout: Math.min(options.timeout ?? config.timeout * 1000, config.timeout * 1000),
		signal: options.signal,
	};
}

async function prepareDisk(disk: string, temporary: boolean): Promise<void> {
	if (existsSync(disk)) {
		if (temporary) await utimes(disk, new Date(), new Date());
		return;
	}
	await mkdir(join(disk, '..'), { recursive: true });
	await disks.create(disk, getConfig('@axium/ai').sandbox.disk * 1024 * 1024, { owner: guestUser });
}

/** Runs a command on a conversation's disk and collects its output */
async function exec(disk: string, temporary: boolean, command: string, options: ExecOptions) {
	return await withLock(disk, async () => {
		await prepareDisk(disk, temporary);
		await acquire(options.signal);
		try {
			return await vm.run({ ...vmOptions(disk, command, options), maxOutput: maxCommandOutput });
		} finally {
			release();
		}
	});
}

export interface SandboxOptions {
	temporary: boolean;
	network: ai.SandboxNetwork;
}

export interface ServerSandbox extends tools.Sandbox {
	/** Streams a file, for downloads */
	open(path: string, signal?: AbortSignal): Promise<Readable>;
}

/** A conversation's sandbox, or nothing while the sandbox isn't available */
export function forConversation(userId: string, conversationId: string, { temporary, network }: SandboxOptions): ServerSandbox | undefined {
	if (!isAvailable()) return;

	const disk = diskPath(userId, conversationId, temporary);

	function check(result: Awaited<ReturnType<typeof exec>>, action: string): Buffer {
		if (result.exitCode === 0) return result.stdout;
		throw new Error(result.stderr.toString().trim() || `Could not ${action}`);
	}

	return {
		network,
		async run(command, { timeout, stdin, signal } = {}) {
			const result = await exec(disk, temporary, command, {
				timeout: timeout && timeout * 1000,
				stdin,
				signal,
				network,
			});
			return {
				exitCode: result.exitCode,
				stdout: result.stdout.toString(),
				stderr: result.stderr.toString(),
				timedOut: result.timedOut,
			};
		},
		async read(path, signal) {
			const command = `size=$(stat -c %s -- ${quote(path)}) || exit 1
if [ "$size" -gt ${maxReadSize} ]; then echo "The file is larger than ${maxReadSize / 1024 / 1024} MiB" >&2; exit 1; fi
cat -- ${quote(path)}`;
			return check(await exec(disk, temporary, command, { signal }), 'read ' + path);
		},
		async write(path, data, signal) {
			const command = `mkdir -p -- "$(dirname -- ${quote(path)})" && cat > ${quote(path)}`;
			check(await exec(disk, temporary, command, { stdin: data, signal }), 'write ' + path);
		},
		async list(signal) {
			const command = `find . -xdev -path ./lost+found -prune -o -type f -printf '%s\\t%T@\\t%P\\0' | head -z -n ${maxListed + 1}`;
			const output = check(await exec(disk, temporary, command, { signal }), 'list files');
			const entries = output.toString().split('\0').filter(Boolean);
			const files = entries.slice(0, maxListed).map((entry): ai.SandboxFile => {
				const [size, modified, ...path] = entry.split('\t');
				return { path: path.join('\t'), size: Number(size), modified: new Date(Number(modified) * 1000) };
			});
			return { files, truncated: entries.length > maxListed };
		},
		async open(path, signal) {
			let opened!: (stream: Readable) => void;
			const stream = new Promise<Readable>(resolve => (opened = resolve));

			const done = withLock(disk, async () => {
				await prepareDisk(disk, temporary);
				await acquire(signal);
				try {
					const running = await vm.start(vmOptions(disk, `cat -- ${quote(path)}`, { signal }));
					running.stderr.resume();
					opened(running.stdout);
					await running.exited;
				} finally {
					release();
				}
			});

			return await Promise.race([stream, done.then(() => stream)]);
		},
	};
}

/** Deletes a conversation's sandbox */
export async function remove(userId: string, conversationId: string, temporary: boolean): Promise<void> {
	const disk = diskPath(userId, conversationId, temporary);
	await withLock(disk, () => rm(disk, { force: true }));
}

/** Deletes sandboxes whose conversations were deleted, unused temporary ones and old images */
async function sweep(): Promise<void> {
	const saved = directory('disks');
	for (const userId of existsSync(saved) ? await readdir(saved) : []) {
		const files = (await readdir(join(saved, userId))).filter(name => name.endsWith('.img'));
		const ids = files.map(name => name.slice(0, -4)).filter(id => /^[\da-f-]{36}$/.test(id));
		const existing = new Set(
			ids.length
				? (await database.selectFrom('ai_conversations').select('id').where('id', 'in', ids).execute()).map(row => row.id)
				: []
		);
		for (const id of ids) if (!existing.has(id)) await remove(userId, id, false);
	}

	const temporary = directory('temporary');
	for (const userId of existsSync(temporary) ? await readdir(temporary) : []) {
		for (const name of await readdir(join(temporary, userId))) {
			const path = join(temporary, userId, name);
			const { mtimeMs } = await stat(path);
			if (Date.now() - mtimeMs > temporaryLifetime && !locks.has(path)) await rm(path, { force: true });
		}
	}

	const images = directory('images');
	if (state.status != 'ready' || running || !existsSync(images)) return;
	for (const name of await readdir(images)) {
		if (name != state.key) await removeTree(join(images, name));
	}
}

jobs.define('ai.sandbox.sweep', {
	every: 3_600_000,
	run: sweep,
});
