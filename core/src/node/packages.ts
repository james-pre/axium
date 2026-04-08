import * as fs from 'node:fs';
import { findPackageJSON } from 'node:module';
import { getPackage, isRelative, type PackageJSON, type PackageVersionInfo } from '../packages.js';
import { debug } from 'ioium/node';

export function getPackageJSON(specifier: string, from: string): PackageJSON & Record<string, any> & { __path: string } {
	try {
		if (!isRelative(specifier)) from = import.meta.resolve(specifier, from);
	} catch {
		debug(`Using fallback base path to resolve package.json of ${specifier}`);
	}

	const path = findPackageJSON(specifier, from);
	if (!path) throw new Error(`Cannot find package.json for package ${specifier} (from ${from})`);

	try {
		const info = JSON.parse(fs.readFileSync(path, 'utf8'));
		info.__path = path;
		return info;
	} catch {
		throw new Error('Invalid or missing metadata for ' + specifier);
	}
}

/**
 * @param name Package name
 * @param version The current/installed version
 */
export async function getVersionInfo(specifier: string, from: string = import.meta.filename): Promise<PackageVersionInfo> {
	const { version, name } = getPackageJSON(specifier, from);
	const pkg = await getPackage(name);
	return { name, version, latest: pkg?._latest };
}
