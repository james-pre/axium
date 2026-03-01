import * as fs from 'node:fs';
import { findPackageJSON } from 'node:module';
import { getPackage, type PackageVersionInfo } from '../packages.js';

/**
 * @param name Package name
 * @param version The current/installed version
 */
export async function getVersionInfo(specifier: string, from: string = import.meta.filename): Promise<PackageVersionInfo> {
	const path = findPackageJSON(specifier, import.meta.resolve(specifier, from));
	if (!path) throw new Error(`Cannot find package.json for package ${specifier} (from ${from})`);
	const { version, name } = JSON.parse(fs.readFileSync(path, 'utf8'));

	const pkg = await getPackage(name);
	return { name, version, latest: pkg?._latest };
}
