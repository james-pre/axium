import * as z from 'zod';
import { lt as ltVersion } from 'semver';
import { warn } from './io.js';

export const PackageVersionInfo = z.object({
	name: z.string(),
	version: z.string(),
	latest: z.string().nullish(),
});

export interface PackageVersionInfo extends z.infer<typeof PackageVersionInfo> {}

export function isRelative(specifier: string): boolean {
	return specifier[0] == '/' || ['.', '..'].includes(specifier.split('/')[0]);
}

interface NpmPackageVersion {
	name: string;
	version: string;
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
export async function getPackage(specifier: string): Promise<NpmPackage | null> {
	if (isRelative(specifier)) return null;

	const cached = cache.get(specifier);

	if (cached && Date.now() - cached.timestamp < cacheTTL) return cached.data;

	try {
		const pkg = await fetch('https://registry.npmjs.org/' + specifier).then(res => res.json());
		pkg._latest = pkg['dist-tags']?.latest || Object.keys(pkg.versions).sort((a, b) => (ltVersion(a, b) ? 1 : -1))[0];
		cache.set(specifier, { timestamp: Date.now(), data: pkg });
		return pkg;
	} catch (e) {
		warn(`Failed to fetch metadata for package ${specifier}: ${e instanceof Error ? e.message : String(e)}`);
		return cached?.data || null;
	}
}
