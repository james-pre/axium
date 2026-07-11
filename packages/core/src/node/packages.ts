import * as io from 'ioium/node';
import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { findPackageJSON } from 'node:module';
import { styleText } from 'node:util';
import { lte, major } from 'semver';
import $pkg from '../../package.json' with { type: 'json' };
import { formatBytes } from '../format.js';
import { fetchPackageMetadata, getActivePackages, isPath, type PackageJSON, type PackageVersionInfo } from '../packages.js';

export function getPackageJSON(specifier: string, from: string): PackageJSON & Record<string, any> & { __path: string } {
	try {
		if (!isPath(specifier)) from = import.meta.resolve(specifier, from);
		else {
			// Try to fix directories' missing a trailing slash which causes `findPackageJSON` use the parent package.json if it exists
			const stats = fs.statSync(specifier);
			if (stats.isDirectory() && specifier.at(-1) != '/') specifier += '/';
		}
	} catch {
		io.debug(`Using fallback base path to resolve package.json of ${specifier}`);
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
	const pkg = await fetchPackageMetadata(name);
	return { name, version, latest: pkg?._latest };
}

export interface PackageChangeOptions {
	/** Integrate with source control */
	git?: boolean;
	/** Do not make changes to packages */
	dryRun?: boolean;
}

export interface PackageUpgradeOptions extends PackageChangeOptions {
	/** Allow semver-major package updates */
	allowBreaking?: boolean;
}

export interface PackageChangeConfig {
	builtin?: (PackageJSON & { [k: string]: any })[];
	postinstall?(): void | Promise<void>;
}

export async function upgradeActivePackages(filter: string[], opt: PackageUpgradeOptions, hooks: PackageChangeConfig) {
	if (opt.git && execSync('git status --porcelain', { encoding: 'utf8' })) throw 'Working directory is not clean.';

	io.start('Fetching package metadata');
	const allPackages = await getActivePackages([$pkg, ...(hooks.builtin || [])], io.progress);

	let breakingExcluded = 0;

	const packages = allPackages.filter(pkg => {
		if (filter?.length && !filter.includes(pkg.name)) return false;
		if (lte(pkg.latest, pkg.version)) return false;
		if (major(pkg.latest) != major(pkg.version) && !opt.allowBreaking) {
			breakingExcluded++;
			return false;
		}
		return true;
	});

	if (!packages.length) {
		console.log('Already up to date.');
		return;
	}

	console.log('Upgrading:');
	io.table(
		[
			{ name: 'Package', text: pkg => pkg.name },
			{ name: 'Current Version', text: pkg => pkg.version },
			{
				name: 'New Version',
				text: pkg => pkg.latest,
				format: (latest, pkg) => styleText(major(latest) != major(pkg.version) ? 'red' : 'reset', latest),
			},
			{
				name: 'Size',
				text: pkg => formatBytes(pkg.latestSize),
				padStart: true,
				grow: 0,
			},
			{
				name: 'Change',
				text(pkg) {
					const changedBytes = pkg.latestSize - pkg.size;
					return (changedBytes < 0n ? '-' : '+') + formatBytes(changedBytes < 0n ? -changedBytes : changedBytes);
				},
				format(text, pkg) {
					const changedBytes = pkg.latestSize - pkg.size;
					const abs = changedBytes < 0n ? -changedBytes : changedBytes;
					return styleText(changedBytes < 0n ? 'green' : abs < 1000n ? 'reset' : abs < 1000000n ? 'yellow' : 'red', text);
				},
				padStart: true,
				grow: 0,
			},
		],
		{
			formatHead: text => styleText('bold', text),
		},
		packages
	);

	if (!opt.allowBreaking && breakingExcluded) {
		console.log('Excluded', breakingExcluded, 'breaking changes. Use --allow-breaking to include them.');
	}

	let oldSizeSum = 0n,
		newSizeSum = 0n;

	for (const pkg of packages) {
		oldSizeSum += pkg.size;
		newSizeSum += pkg.latestSize;
	}

	console.log(
		'After this operation,',
		newSizeSum > oldSizeSum
			? formatBytes(newSizeSum - oldSizeSum) + ' extra will be used'
			: formatBytes(oldSizeSum - newSizeSum) + ' will be freed',
		`(install ${formatBytes(newSizeSum)}, remove ${formatBytes(oldSizeSum)}).`
	);

	await io.assertYes();

	if (opt.dryRun) {
		io.warn('--dry-run: No packages were changed.');
	} else {
		io.track('Upgrading packages', () => {
			execFileSync('npm', ['install', ...packages.map(pkg => `${pkg.name}@${pkg.latest}`)]);
		});
	}

	await hooks.postinstall?.();

	if (opt.git) {
		io.track('Committing to source control', () =>
			execSync('git commit --all --file=-', {
				encoding: 'utf8',
				input: 'axium upgrade\n' + packages.map(pkg => `${pkg.name} ${pkg.version}->${pkg.latest}`).join('\n'),
			})
		);
	}
}
