import * as io from 'ioium';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as z from 'zod';
import * as disk from './disk.js';
import { guestFiles } from './guest.js';
import * as vm from './vm.js';

/** A root filesystem built from a container image */
export interface Image {
	/** A raw ext4 image, which every VM shares read-only */
	disk: string;
	/** `NAME=value` from the image */
	env: string[];
}

export const ImageInfo = z.object({
	reference: z.string(),
	setup: z.string(),
	env: z.string().array(),
	built: z.coerce.date(),
});
export interface ImageInfo extends z.infer<typeof ImageInfo> {}

export interface BuildOptions {
	/** e.g. `docker.io/library/python:3.14-slim` */
	reference: string;
	/** A shell script run as root in the new root filesystem, with access to package registries */
	setup: string;
	/** Where images are kept */
	dir: string;
	/** In MiB */
	memory: number;
	cpus: number;
	signal?: AbortSignal;
}

const platformArchitectures: Partial<Record<NodeJS.Architecture, string>> = { x64: 'amd64', arm64: 'arm64' };

/** Identifies the image built from a reference and setup script */
export function imageKey(reference: string, setup: string): string {
	return createHash('sha256')
		.update(JSON.stringify([reference, setup, process.arch]))
		.digest('hex')
		.slice(0, 16);
}

/** The built image for a reference and setup script, if it exists */
export async function findImage(dir: string, reference: string, setup: string): Promise<Image | undefined> {
	const path = join(dir, imageKey(reference, setup));
	if (!existsSync(join(path, 'image.json'))) return;
	const info = ImageInfo.parse(JSON.parse(await readFile(join(path, 'image.json'), 'utf8')));
	return { disk: join(path, 'root.img'), env: info.env };
}

interface Reference {
	registry: string;
	repository: string;
	/** A tag or digest */
	version: string;
}

function parseReference(reference: string): Reference {
	let rest = reference;
	let registry = 'registry-1.docker.io';

	const slash = rest.indexOf('/');
	const first = rest.slice(0, slash);
	if (slash != -1 && (first.includes('.') || first.includes(':') || first == 'localhost')) {
		if (first != 'docker.io') registry = first;
		rest = rest.slice(slash + 1);
	}

	let version = 'latest';
	const at = rest.indexOf('@');
	if (at != -1) {
		version = rest.slice(at + 1);
		rest = rest.slice(0, at);
	} else {
		const colon = rest.lastIndexOf(':');
		if (colon > rest.lastIndexOf('/')) {
			version = rest.slice(colon + 1);
			rest = rest.slice(0, colon);
		}
	}

	if (registry == 'registry-1.docker.io' && !rest.includes('/')) rest = 'library/' + rest;
	if (!/^[a-z0-9._/-]+$/.test(rest) || !/^[\w.:+-]+$/.test(version)) throw new Error('Invalid image reference: ' + reference);

	return { registry, repository: rest, version };
}

const Descriptor = z.object({
	mediaType: z.string().optional(),
	digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	platform: z.object({ os: z.string(), architecture: z.string(), variant: z.string().optional() }).optional(),
});

const Manifest = z.object({
	mediaType: z.string().optional(),
	manifests: Descriptor.array().optional(),
	config: Descriptor.optional(),
	layers: Descriptor.array().optional(),
});

const ImageConfig = z.object({
	config: z.object({ Env: z.string().array().nullish() }).nullish(),
});

const manifestTypes = [
	'application/vnd.oci.image.index.v1+json',
	'application/vnd.docker.distribution.manifest.list.v2+json',
	'application/vnd.oci.image.manifest.v1+json',
	'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

class Registry {
	protected token?: string;

	constructor(
		protected readonly reference: Reference,
		protected readonly signal?: AbortSignal
	) {}

	protected async authenticate(challenge: string): Promise<void> {
		const parameters = Object.fromEntries(Array.from(challenge.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [key, value]));
		if (!/^bearer/i.test(challenge) || !parameters.realm) throw new Error('The registry asked for credentials');

		const url = new URL(parameters.realm);
		if (parameters.service) url.searchParams.set('service', parameters.service);
		url.searchParams.set('scope', parameters.scope ?? `repository:${this.reference.repository}:pull`);

		const response = await fetch(url, { signal: this.signal });
		if (!response.ok) throw new Error(`The registry refused a token (${response.status})`);
		const { token, access_token } = (await response.json()) as { token?: string; access_token?: string };
		this.token = token ?? access_token;
	}

	async get(path: string, accept?: string): Promise<Response> {
		const url = `https://${this.reference.registry}/v2/${this.reference.repository}/${path}`;
		const send = () =>
			fetch(url, {
				signal: this.signal,
				headers: { ...(accept && { Accept: accept }), ...(this.token && { Authorization: 'Bearer ' + this.token }) },
			});

		let response = await send();
		if (response.status == 401 && !this.token) {
			await this.authenticate(response.headers.get('www-authenticate') ?? '');
			response = await send();
		}
		if (!response.ok) throw new Error(`The registry responded with ${response.status} for ${path}`);
		return response;
	}

	async manifest(version: string): Promise<z.infer<typeof Manifest>> {
		const manifest = Manifest.parse(await (await this.get('manifests/' + version, manifestTypes)).json());
		if (!manifest.manifests) return manifest;

		const architecture = platformArchitectures[process.arch];
		const match = manifest.manifests.find(entry => entry.platform?.os == 'linux' && entry.platform.architecture == architecture);
		if (!match) throw new Error(`The image has no linux/${architecture} version`);
		return await this.manifest(match.digest);
	}

	/** Downloads a blob to `path`, checking its digest */
	async download(digest: string, path: string): Promise<void> {
		const response = await this.get('blobs/' + digest);
		const hash = createHash('sha256');
		const hasher = new Transform({
			transform(chunk, _, callback) {
				hash.update(chunk);
				callback(null, chunk);
			},
		});
		await pipeline(Readable.fromWeb(response.body as any), hasher, createWriteStream(path), { signal: this.signal });
		if ('sha256:' + hash.digest('hex') != digest) throw new Error('A downloaded layer does not match its digest');
	}
}

/** Runs a command that can only write to `target`, which it sees at /target */
async function jailed(target: string, args: string[], options: { binds?: [string, string][]; stdin?: string } = {}): Promise<void> {
	const child = spawn(
		'bwrap',
		[
			'--unshare-all',
			'--unshare-user',
			'--disable-userns',
			'--die-with-parent',
			'--new-session',
			'--cap-drop',
			'ALL',
			'--ro-bind',
			'/usr',
			'/usr',
			...['lib64', 'lib', 'bin', 'sbin'].flatMap(name => ['--symlink', 'usr/' + name, '/' + name]),
			'--proc',
			'/proc',
			'--dev',
			'/dev',
			'--tmpfs',
			'/tmp',
			'--bind',
			target,
			'/target',
			...(options.binds ?? []).flatMap(([source, destination]) => ['--ro-bind', source, destination]),
			...args,
		],
		{ stdio: ['pipe', 'ignore', 'pipe'] }
	);
	child.stdin.end(options.stdin);

	let stderr = '';
	child.stderr.setEncoding('utf8').on('data', (text: string) => (stderr = (stderr + text).slice(-2000)));

	const code = await new Promise<number | null>((resolve, reject) => {
		child.once('error', reject);
		child.once('close', resolve);
	});
	if (code !== 0) throw new Error(`${args[0]} failed: ${stderr.trim() || 'exit code ' + code}`);
}

async function listLayer(path: string): Promise<string[]> {
	const child = spawn('tar', ['-tf', path], { stdio: ['ignore', 'pipe', 'pipe'] });
	let listing = '';
	child.stdout.setEncoding('utf8').on('data', (text: string) => (listing += text));
	const code = await new Promise<number | null>((resolve, reject) => {
		child.once('error', reject);
		child.once('close', resolve);
	});
	if (code !== 0) throw new Error('Could not read a layer of the image');
	return listing.split('\n').filter(Boolean);
}

/** Applies a layer's deletions (whiteout files), then extracts it */
async function applyLayer(root: string, layer: string): Promise<void> {
	const removed: string[] = [];
	const cleared: string[] = [];

	for (const entry of await listLayer(layer)) {
		const name = entry.replace(/^\.?\/+/, '').replace(/\/$/, '');
		const slash = name.lastIndexOf('/');
		const [parent, base] = [name.slice(0, slash + 1), name.slice(slash + 1)];
		if (!base.startsWith('.wh.') || name.split('/').includes('..')) continue;
		if (base == '.wh..wh..opq') cleared.push('/target/' + parent);
		else removed.push('/target/' + parent + base.slice(4));
	}

	if (removed.length) await jailed(root, ['xargs', '-0', '-r', 'rm', '-rf', '--'], { stdin: removed.join('\0') });
	if (cleared.length) {
		const script = 'for dir; do find "$dir" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; done';
		await jailed(root, ['xargs', '-0', '-r', 'sh', '-c', script, 'sh'], { stdin: cleared.join('\0') });
	}

	await jailed(root, ['tar', '-xf', '/layer', '-C', '/target', '--exclude=.wh.*', '--exclude=dev/*', '--no-same-owner'], {
		binds: [[layer, '/layer']],
	});
}

/** Deletes a directory from an image, including read-only directories in it */
export async function removeTree(path: string): Promise<void> {
	if (!existsSync(path)) return;
	await new Promise<void>((resolve, reject) => {
		const child = spawn('chmod', ['-R', 'u+rwX', path], { stdio: 'ignore' });
		child.once('error', reject);
		child.once('close', () => resolve());
	});
	await rm(path, { recursive: true, force: true });
}

/** The most output kept from build steps, in bytes */
const maxBuildOutput = 64 * 1024;

/** The space the root filesystem may use, in bytes; the image is sparse, so unused space takes none */
const rootSize = 32 * 1024 ** 3;

/** Runs a build step as root in a VM, throwing with the end of its output when it fails */
async function buildStep(name: string, options: Omit<vm.Options, 'asRoot' | 'timeout'>): Promise<void> {
	const result = await vm.run({ ...options, asRoot: true, timeout: 30 * 60_000, maxOutput: maxBuildOutput });
	if (result.exitCode === 0) return;
	const output = (result.stdout.toString() + '\n' + result.stderr.toString()).trim().split('\n').slice(-20).join('\n');
	throw new Error(`The ${name} ${result.timedOut ? 'timed out' : `failed with exit code ${result.exitCode}`}:\n${output}`);
}

/**
 * Builds a root filesystem image from a container image and setup script, or returns the existing one.
 * Layers are extracted onto the image inside a VM, where root can keep files' owners, which the host's unprivileged user can't.
 */
export async function buildImage(options: BuildOptions): Promise<Image> {
	const existing = await findImage(options.dir, options.reference, options.setup);
	if (existing) return existing;

	const path = join(options.dir, imageKey(options.reference, options.setup));
	const partial = path + '.partial';
	/** The image's files extracted without their owners, which the VM extracting them properly boots from */
	const boot = join(partial, 'boot');
	const layers = join(boot, 'layers');
	const root = join(partial, 'root.img');
	await removeTree(partial);
	await mkdir(layers, { recursive: true });

	try {
		const reference = parseReference(options.reference);
		const registry = new Registry(reference, options.signal);
		const manifest = await registry.manifest(reference.version);
		if (!manifest.config || !manifest.layers) throw new Error('The image manifest has no layers');

		const configPath = join(partial, 'config.json');
		await registry.download(manifest.config.digest, configPath);
		const config = ImageConfig.parse(JSON.parse(await readFile(configPath, 'utf8')));
		const env = config.config?.Env ?? ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'];

		for (const [index, layer] of manifest.layers.entries()) {
			io.debug(`AI: sandbox image layer ${index + 1} of ${manifest.layers.length}`);
			const layerPath = join(layers, String(index).padStart(3, '0'));
			await registry.download(layer.digest, layerPath);
			await applyLayer(boot, layerPath);
		}
		await mkdir(join(boot, 'work'), { recursive: true });
		await mkdir(join(boot, 'sandbox'), { recursive: true });

		await disk.create(root, rootSize, { journal: false });

		const common = { memory: options.memory, cpus: options.cpus, env, signal: options.signal };

		io.debug('AI: extracting the sandbox image');
		await buildStep('extraction', { ...common, root: { directory: boot }, work: root, command: guestFiles().extract, network: 'none' });
		await removeTree(boot);

		if (options.setup.trim()) {
			io.debug('AI: running the sandbox setup script');
			await buildStep('setup script', {
				...common,
				root: { disk: root },
				writableRoot: true,
				command: options.setup,
				network: 'packages',
			});
		}

		await disk.repair(root);

		const info: ImageInfo = { reference: options.reference, setup: options.setup, env, built: new Date() };
		await writeFile(join(partial, 'image.json'), JSON.stringify(info, null, '\t'));
		await rm(configPath);
		await rename(partial, path);
		return { disk: join(path, 'root.img'), env };
	} catch (error) {
		await removeTree(partial);
		throw error;
	}
}
