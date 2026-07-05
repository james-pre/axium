import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const init = process.env.INIT_CWD || process.cwd();

// no consumer project (global or standalone install)
if (process.env.npm_config_global === 'true' || !existsSync(join(init, 'node_modules'))) process.exit(0);

const patchKey = '@sveltejs/kit@2.56.1';
const patchFile = join(import.meta.dirname, '@sveltejs/kit@2.56.1.patch');
const patchPath = 'node_modules/@axium/server/patches/@sveltejs/kit@2.56.1.patch';

const pkgPath = join(init, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.patchedDependencies ??= {};
if (pkg.patchedDependencies[patchKey] !== patchPath) {
	pkg.patchedDependencies[patchKey] = patchPath;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
}

let kitDir;
try {
	const require = createRequire(join(init, 'package.json'));
	kitDir = dirname(require.resolve('@sveltejs/kit/package.json'));
} catch {
	// kit isn't installed in the consumer (e.g. it only pulls in a subset of axium) — nothing to patch.
	process.exit(0);
}

if (readFileSync(join(kitDir, 'src/exports/vite/index.js'), 'utf8').includes('__axiumNestedConfig')) process.exit(0);

execFileSync('patch', ['-p1', '--forward', '--batch', '--input', patchFile], { cwd: kitDir, stdio: 'inherit' });
