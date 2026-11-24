import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type * as ai from '../../common.js';
import { guestFiles, guestUser, proxyAddress, proxyPort } from './guest.js';
import type * as launch from './launch.js';
import { startProxy } from './proxy.js';

export interface Options {
	/** A raw ext4 image, or a directory for building images */
	root: { disk: string } | { directory: string };
	writableRoot?: boolean;
	/** A raw ext4 image mounted at /work */
	work?: string;
	/** In MiB */
	memory: number;
	cpus: number;
	/** A shell script, run in /work */
	command: string;
	/** Runs the command as root instead of the sandbox user */
	asRoot?: boolean;
	/** `NAME=value`; values that aren't printable ASCII are left out */
	env: string[];
	network: ai.SandboxNetwork;
	stdin?: Uint8Array | ReadableStream<Uint8Array>;
	/** In milliseconds */
	timeout: number;
	signal?: AbortSignal;
}

export interface Exit {
	/** `null` when the VM was stopped */
	exitCode: number | null;
	timedOut: boolean;
}

export interface Running {
	stdout: Readable;
	stderr: Readable;
	exited: Promise<Exit>;
}

/** Compiled `launch.js` and its imports */
const launcherDir = import.meta.dirname;

/** The guest kernel's command line carries the environment, so it must be printable ASCII */
const printable = /^[\x20-\x7e]*$/;

function jailArguments(options: Options, run: string): string[] {
	const node = process.execPath;
	return [
		'--unshare-all',
		'--unshare-user',
		'--disable-userns',
		'--die-with-parent',
		'--new-session',
		'--cap-drop',
		'ALL',
		'--clearenv',
		'--ro-bind',
		'/usr',
		'/usr',
		...['lib64', 'lib', 'bin', 'sbin'].flatMap(name => ['--symlink', 'usr/' + name, '/' + name]),
		...(node.startsWith('/usr/') ? [] : ['--ro-bind', node, node]),
		'--proc',
		'/proc',
		'--dev',
		'/dev',
		'--dev-bind',
		'/dev/kvm',
		'/dev/kvm',
		'--tmpfs',
		'/tmp',
		'--ro-bind',
		launcherDir,
		'/launcher',
		'--ro-bind',
		run,
		'/vm/run',
		'--bind',
		join(run, 'exit'),
		'/vm/exit',
		options.writableRoot ? '--bind' : '--ro-bind',
		'disk' in options.root ? options.root.disk : options.root.directory,
		'/vm/root',
		...(options.work ? ['--bind', options.work, '/vm/work.img'] : []),
		'--chdir',
		'/',
		node,
		'--disable-warning=ExperimentalWarning',
		'/launcher/launch.js',
		'/vm/run/spec.json',
	];
}

/**
 * Runs a command in a microVM, inside a jail that can only reach the VM's own files and `/dev/kvm`.
 * The guest has no network except through a proxy enforcing `network`.
 */
export async function start(options: Options): Promise<Running> {
	const run = await mkdtemp(join(tmpdir(), 'axium-vm-'));
	let proxy: Server | undefined;

	try {
		if (options.network != 'none') proxy = await startProxy(join(run, 'proxy.sock'), options.network);

		const env = [
			...options.env,
			'HOME=/work',
			'LANG=C.UTF-8',
			'MPLBACKEND=Agg',
			'SANDBOX_UID=' + guestUser,
			'SANDBOX_PROXY_PORT=' + proxyPort,
			...(options.asRoot ? ['SANDBOX_USER=root'] : []),
			...(options.work ? [`SANDBOX_WORK=/dev/vd${'disk' in options.root ? 'b' : 'a'}`] : []),
			...(proxy ? ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'].map(name => `${name}=${proxyAddress}`) : []),
		].filter(entry => printable.test(entry));

		const files = join(run, 'files');
		await mkdir(files);
		await mkdir(join(run, 'exit'), { mode: 0o700 });
		const { init, forward } = guestFiles();
		await writeFile(join(files, 'init'), init, { mode: 0o555 });
		await writeFile(join(files, 'command'), options.command, { mode: 0o444 });
		if (proxy) await writeFile(join(files, 'forward'), forward, { mode: 0o444 });

		const spec: launch.Spec = {
			root: 'disk' in options.root ? { disk: '/vm/root' } : { directory: '/vm/root' },
			writableRoot: !!options.writableRoot,
			disks: options.work ? [{ path: '/vm/work.img', writable: true }] : [],
			shares: { sandbox: { path: '/vm/run/files', writable: false }, exit: { path: '/vm/exit', writable: true } },
			memory: options.memory,
			cpus: options.cpus,
			proxy: proxy && { path: '/vm/run/proxy.sock', port: proxyPort },
			exec: ['/bin/sh', '-c', 'mount -t virtiofs -o ro,nosuid,nodev sandbox /sandbox && exec /bin/sh /sandbox/init'],
			env,
		};
		await writeFile(join(run, 'spec.json'), JSON.stringify(spec), { mode: 0o600 });
	} catch (error) {
		proxy?.close();
		await rm(run, { recursive: true, force: true });
		throw error;
	}

	const child = spawn('bwrap', jailArguments(options, run), { stdio: ['pipe', 'pipe', 'pipe'] });

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill('SIGKILL');
	}, options.timeout);
	const abort = () => child.kill('SIGKILL');
	options.signal?.addEventListener('abort', abort, { once: true });
	if (options.signal?.aborted) abort();

	child.stdin.on('error', () => {});
	if (options.stdin instanceof ReadableStream) Readable.fromWeb(options.stdin as any).pipe(child.stdin);
	else child.stdin.end(options.stdin);

	const exited = new Promise<number | null>((resolve, reject) => {
		child.once('error', reject);
		child.once('close', resolve);
	})
		.then(async (code): Promise<Exit> => {
			if (timedOut || options.signal?.aborted) return { exitCode: null, timedOut };
			const reported = await readFile(join(run, 'exit', 'status'), 'utf8').catch(() => '');
			return { exitCode: /^\d{1,3}\s*$/.test(reported) ? Number(reported) : code, timedOut };
		})
		.finally(async () => {
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', abort);
			proxy?.close();
			proxy?.closeAllConnections();
			await rm(run, { recursive: true, force: true });
		});

	return { stdout: child.stdout, stderr: child.stderr, exited };
}

export interface Result extends Exit {
	stdout: Buffer;
	stderr: Buffer;
	/** Whether output past `maxOutput` was left out */
	truncated: boolean;
}

/** Reads up to `max` bytes, then discards the rest so the VM never blocks on a full pipe */
async function collect(stream: Readable, max: number): Promise<{ data: Buffer; truncated: boolean }> {
	const chunks: Buffer[] = [];
	let size = 0;
	let truncated = false;
	for await (const chunk of stream as AsyncIterable<Buffer>) {
		if (size >= max) {
			truncated = true;
			continue;
		}
		const kept = chunk.subarray(0, max - size);
		truncated ||= kept.length < chunk.length;
		chunks.push(kept);
		size += kept.length;
	}
	return { data: Buffer.concat(chunks), truncated };
}

/**
 * Runs a command in a microVM and collects its output
 * @param maxOutput The most bytes kept from each of stdout and stderr
 */
export async function run(options: Options & { maxOutput: number }): Promise<Result> {
	const running = await start(options);
	const [stdout, stderr, exit] = await Promise.all([
		collect(running.stdout, options.maxOutput),
		collect(running.stderr, options.maxOutput),
		running.exited,
	]);
	return { ...exit, stdout: stdout.data, stderr: stderr.data, truncated: stdout.truncated || stderr.truncated };
}

/** Throws with a description of what is missing when this machine can't run microVMs */
export async function check(): Promise<void> {
	await access('/dev/kvm', constants.R_OK | constants.W_OK).catch(() => {
		throw new Error('/dev/kvm is missing or not accessible, so virtual machines can not run');
	});

	const child = spawn(
		'bwrap',
		[
			'--unshare-all',
			'--unshare-user',
			'--die-with-parent',
			'--ro-bind',
			'/usr',
			'/usr',
			...['lib64', 'lib', 'bin'].flatMap(name => ['--symlink', 'usr/' + name, '/' + name]),
			...(process.execPath.startsWith('/usr/') ? [] : ['--ro-bind', process.execPath, process.execPath]),
			'--dev',
			'/dev',
			'--ro-bind',
			launcherDir,
			'/launcher',
			process.execPath,
			'--disable-warning=ExperimentalWarning',
			'/launcher/launch.js',
			'--check',
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);

	const { data: stderr } = await collect(child.stderr, 4096);
	const code = await new Promise<number | null>((resolve, reject) => {
		child.once('error', error =>
			reject((error as NodeJS.ErrnoException).code == 'ENOENT' ? new Error('bubblewrap (bwrap) is not installed') : error)
		);
		child.once('close', resolve);
	});

	if (code === 0) return;
	const detail = stderr.toString().trim();
	if (/libkrun/i.test(detail)) throw new Error('libkrun is not installed (it needs the libkrun and libkrunfw packages)');
	throw new Error(detail || `The sandbox check exited with code ${code}`);
}
