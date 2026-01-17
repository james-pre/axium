import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { lt as ltVersion } from 'semver';
import { warn } from './io.js';

function isRelative(specifier: string): boolean {
	return specifier[0] == '/' || ['.', '..'].includes(specifier.split('/')[0]);
}

export function locatePackage(specifier: string, loadedBy: string): string {
	if (isRelative(specifier)) {
		const path = resolve(dirname(loadedBy), specifier);
		const stats = fs.statSync(path);
		if (stats.isFile()) return path;
		if (!stats.isDirectory()) throw new Error('Can not resolve package path: ' + path);
		return join(path, 'package.json');
	}

	let packageDir = dirname(fileURLToPath(import.meta.resolve(specifier)));
	for (; !fs.existsSync(join(packageDir, 'package.json')); packageDir = dirname(packageDir));
	return join(packageDir, 'package.json');
}

interface NpmPackageVersion {
	name: string;
	version: string;
}

interface NpmPackage {
	name: string;
	'dist-tags': Record<string, string>;
	versions: Record<string, NpmPackageVersion>;
}

export interface PackageVersionInfo {
	name: string;
	version: string;
	latest: string | null;
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
 * @param name Package name
 * @param version The current/installed version
 */
export async function getVersionInfo(specifier: string, from: string = import.meta.filename): Promise<PackageVersionInfo> {
	const path = locatePackage(specifier, from);
	const { version, name } = JSON.parse(fs.readFileSync(path, 'utf8'));

	const info: PackageVersionInfo = { name, version, latest: null };

	if (isRelative(specifier)) return info;

	const cached = cache.get(specifier);

	const useCache = cached && Date.now() - cached.timestamp < cacheTTL;

	try {
		const pkg = useCache ? cached.data : await fetch('https://registry.npmjs.org/' + specifier).then(res => res.json());
		if (!useCache) cache.set(specifier, { timestamp: Date.now(), data: pkg });

		info.latest = pkg['dist-tags']?.latest || Object.keys(pkg.versions).sort((a, b) => (ltVersion(a, b) ? 1 : -1))[0];
	} catch (e) {
		warn(`Failed to fetch version info for package ${name}: ${e instanceof Error ? e.message : String(e)}`);
	}

	return info;
}
