import { errorText, warn } from 'ioium';
import { lt as ltVersion } from 'semver';
import { wait } from 'utilium/misc';
import * as z from 'zod';
import { plugins } from './plugins.js';

export interface PackageJSON {
	name: string;
	version: string;
	description?: string;
}

export const PackageVersionInfo = z.object({
	name: z.string(),
	version: z.string(),
	latest: z.string().nullish(),
});

export interface PackageVersionInfo extends z.infer<typeof PackageVersionInfo> {}

/**
 * Whether the specifier is a path (i.e. is not bare)
 */
export function isPath(specifier: string): boolean {
	return specifier[0] == '/' || ['.', '..'].includes(specifier.split('/')[0]);
}

interface NpmPackageVersion {
	name: string;
	version: string;
	dist: {
		shasum: string;
		tarball: string;
		unpackedSize: number;
	};
}

export interface NpmPackage {
	name: string;
	'dist-tags': Record<string, string>;
	versions: Record<string, NpmPackageVersion>;
	_latest: string;
}

let cacheTTL = 1000 * 60 * 60;

export function setPackageCacheTTL(seconds: number) {
	cacheTTL = seconds * 1000;
}

interface CacheEntry {
	timestamp: number;
	data: NpmPackage;
}

const cache = new Map<string, CacheEntry>();

/**
 * Get information for an npm package
 */
export async function fetchPackageMetadata(this: { retry?: number } | void, specifier: string): Promise<NpmPackage | null> {
	if (isPath(specifier)) return null;

	const cached = cache.get(specifier);

	if (cached && Date.now() - cached.timestamp < cacheTTL) return cached.data;

	let { retry = 0 } = this || {};

	try {
		const res = await fetch('https://registry.npmjs.org/' + specifier);

		if (res.status == 429 && retry < 5) {
			retry++;
			// Exponential backoff
			await wait(Math.pow(2, retry) * 1000);
			return await fetchPackageMetadata.call({ retry }, specifier);
		}

		if (!res.ok) throw res.statusText;

		const pkg = await res.json();

		pkg._latest = pkg['dist-tags']?.latest || Object.keys(pkg.versions).sort((a, b) => (ltVersion(a, b) ? 1 : -1))[0];
		cache.set(specifier, { timestamp: Date.now(), data: pkg });
		return pkg;
	} catch (e) {
		warn(`Failed to fetch metadata for package ${specifier}: ${errorText(e)}`);
		return cached?.data || null;
	}
}

export interface ActivePackageInfo extends PackageJSON {
	latest: string;
	versions: Record<string, NpmPackageVersion>;
}

export async function getActivePackages(
	builtin: (PackageJSON & { [k: string]: any })[],
	onProgress?: (no: number, total: number) => void
): Promise<ActivePackageInfo[]> {
	const packages: ActivePackageInfo[] = [];

	const count = builtin.length + plugins.size;
	let no = 0;

	onProgress?.(no, count);

	for (const pkg of builtin) {
		const info = await fetchPackageMetadata(pkg.name);
		onProgress?.(++no, count);
		if (!info) continue;
		packages.push({ ...pkg, ...info, latest: info._latest });
	}

	for (const plugin of plugins.values()) {
		if (!plugin.update_checks) {
			onProgress?.(++no, count);
			continue;
		}
		const info = await fetchPackageMetadata(plugin.name);
		onProgress?.(++no, count);
		if (!info) continue;
		packages.push({ ...plugin, ...info, latest: info._latest });
	}
	return packages;
}
