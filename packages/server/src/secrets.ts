import { SecretStore, toBaseName, type SecretInfo, type ZodSpecificType } from '@axium/core';
import * as locales from '@james-pre/locales';
import * as io from 'ioium/node';
import { spawnSync } from 'node:child_process';
import { chownSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path/posix';
import { getByString } from 'utilium';
import { isRoot } from 'utilium/node';
import * as z from 'zod';
import config from './config.js';
import { dirs, localDir, systemDir } from './io.js';
import './state.js';

const fileName = 'secrets.json';
const credentialsDir = join(systemDir, 'credentials');
const serviceUser = 'axium';

const SecretsFile = z.record(z.string(), z.string());

interface Secret {
	value: string;
	source: SecretStore;
}

const pathCache = new WeakMap<z.ZodType, string[]>();

function collectPaths(schema: z.ZodType, prefix: string): string[] {
	if (locales.zod.get(schema)?.secret) return [prefix];

	const specific = schema as ZodSpecificType;
	switch (specific.type) {
		case 'object':
			return Object.entries<z.ZodType>(specific.shape).flatMap(([key, child]) =>
				collectPaths(child, prefix ? `${prefix}.${key}` : key)
			);
		case 'optional':
		case 'nullable':
		case 'nonoptional':
		case 'default':
		case 'prefault':
		case 'readonly':
		case 'catch':
		case 'success':
			return collectPaths(specific.def.innerType, prefix);
		case 'pipe':
			return collectPaths(specific.def.in, prefix);
		default:
			return [];
	}
}

/** The dot-separated paths of secret fields in values of `schema` */
export function paths(schema: z.ZodType): string[] {
	let paths = pathCache.get(schema);
	if (!paths) pathCache.set(schema, (paths = collectPaths(schema, '')));
	return paths;
}

/** The ID of the secret at `path` in a plugin's config, or in the main config when `plugin` is omitted */
export function idFor(path: string, plugin?: string): string {
	return plugin ? `${toBaseName(plugin)}.${path}` : path;
}

/** Where secrets are written when no store is specified. `AXIUM_SECRET_STORE` takes precedence over the config. */
export function defaultStore(): SecretStore {
	const override = SecretStore.safeParse(process.env.AXIUM_SECRET_STORE);
	if (override.success) return override.data;
	return config.secret_store ?? (existsSync('/run/systemd/system') ? 'systemd' : 'file');
}

/** Whether this process can encrypt and decrypt the service user's credentials */
function canUseCredentials(): boolean {
	return isRoot || userInfo().username == serviceUser;
}

/** Give the service user a file or directory this process created as root */
function chownToService(path: string): void {
	if (!isRoot) return;
	const id = spawnSync('id', ['-u', serviceUser], { encoding: 'utf8' });
	const uid = parseInt(id.stdout);
	if (!id.status && Number.isSafeInteger(uid)) chownSync(path, uid, -1);
}

function readCredentials(found: Map<string, Secret>): void {
	let names: string[];
	try {
		names = readdirSync(credentialsDir);
	} catch {
		return;
	}

	for (const id of names) {
		const path = join(credentialsDir, id);
		const result = spawnSync('systemd-creds', ['decrypt', '--no-ask-password', '--uid=' + serviceUser, path, '-'], {
			encoding: 'utf8',
		});
		if (result.status) {
			io.debug(`Could not decrypt credential ${id}: ${result.stderr.trim()}`);
			continue;
		}
		found.set(id, { value: result.stdout, source: 'systemd' });
	}
}

function filePaths(): string[] {
	return [systemDir, ...dirs].map(dir => join(dir, fileName));
}

function readFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	try {
		return io.readJSON(path, SecretsFile);
	} catch (e) {
		io.warn(`Failed to read secrets from ${path}: ${io.errorText(e)}`);
		return {};
	}
}

/** Write a secrets file only the server can read */
function writeFile(path: string, secrets: Record<string, string>): void {
	const created = !existsSync(path);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(secrets, null, '\t'), { encoding: 'utf8', mode: 0o600 });
	if (created) chownToService(path);
}

const loaded = new Map<string, Secret>();
let isLoaded = false;

/** Read secrets from systemd credentials and secrets files, which take precedence in that order */
export function load(): void {
	loaded.clear();
	for (const path of filePaths()) {
		for (const [id, value] of Object.entries(readFile(path))) loaded.set(id, { value, source: 'file' });
	}
	readCredentials(loaded);
	isLoaded = true;
}

export function get(id: string): Secret | undefined {
	if (!isLoaded) load();
	return loaded.get(id);
}

/** Secret IDs that have a value */
export function ids(): string[] {
	if (!isLoaded) load();
	return loaded.keys().toArray();
}

export function info(id: string): SecretInfo {
	const source = get(id)?.source ?? null;
	const store = defaultStore();
	const editable = store == 'systemd' ? canUseCredentials() : source != 'systemd';
	return { id, source, store, editable };
}

/** Information about each secret in values of `schema`, keyed by path */
export function describe(schema: z.ZodType, plugin?: string): Record<string, SecretInfo> {
	return Object.fromEntries(paths(schema).map(path => [path, info(idFor(path, plugin))]));
}

export function set(id: string, value: string, store: SecretStore = defaultStore()): void {
	if (!value) throw 'Secrets can not be empty';

	if (store == 'file') {
		const path = join(localDir(), fileName);
		writeFile(path, { ...readFile(path), [id]: value });
	} else {
		if (!canUseCredentials()) throw `Storing systemd credentials needs to run as root or ${serviceUser}`;

		if (!existsSync(credentialsDir)) {
			mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
			chownToService(credentialsDir);
		}

		const path = join(credentialsDir, id);
		const args = ['encrypt', '--no-ask-password', '--uid=' + serviceUser, '--name=' + id, '-', path];
		const result = spawnSync('systemd-creds', args, { input: value, encoding: 'utf8' });
		if (result.error) throw result.error;
		if (result.status) throw result.stderr.trim() || 'systemd-creds failed';
		chownToService(path);
	}

	if (!isLoaded) load();
	const existing = loaded.get(id);
	if (store == 'systemd' || existing?.source != 'systemd') loaded.set(id, { value, source: store });
}

/** Remove a secret from `store`, or from every store */
export function remove(id: string, store?: SecretStore): void {
	if (store == 'systemd' || (!store && canUseCredentials())) rmSync(join(credentialsDir, id), { force: true });

	if (store != 'systemd') {
		for (const path of filePaths()) {
			const secrets = readFile(path);
			if (!(id in secrets)) continue;
			delete secrets[id];
			writeFile(path, secrets);
		}
	}

	load();
}

function parentOf(data: object, path: string): [Record<string, unknown> | undefined, string] {
	const parts = path.split('.');
	const key = parts.pop()!;
	const parent = parts.length ? getByString<Record<string, unknown>>(data as Record<string, unknown>, parts.join('.')) : data;
	return [typeof parent == 'object' && parent !== null ? (parent as Record<string, unknown>) : undefined, key];
}

/**
 * Remove secret fields from `data`
 * @returns The non-empty values that were removed, keyed by path
 */
export function strip(schema: z.ZodType, data: object): Map<string, string> {
	const taken = new Map<string, string>();
	for (const path of paths(schema)) {
		const [parent, key] = parentOf(data, path);
		if (!parent || !(key in parent)) continue;
		const value = parent[key];
		delete parent[key];
		if (typeof value == 'string' && value) taken.set(path, value);
	}
	return taken;
}

/** Copy stored secrets into `data`, skipping fields whose parent object is missing */
export function apply(schema: z.ZodType, data: object, plugin?: string): void {
	for (const path of paths(schema)) {
		const secret = get(idFor(path, plugin));
		if (!secret) continue;
		const [parent, key] = parentOf(data, path);
		if (parent) parent[key] = secret.value;
	}
}
