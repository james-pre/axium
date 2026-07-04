import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// If this package is installed as a dependency (inside node_modules),
// we want to patch from the consumer's root directory (INIT_CWD).
const cwd = process.cwd();
const init = cwd.includes('node_modules') ? process.env.INIT_CWD || cwd : cwd;

// no consumer project (global or standalone install)
if (process.env.npm_config_global === 'true' || !existsSync(join(init, 'node_modules'))) process.exit(0);

// npm applies patches declared in `patchedDependencies` during install. Register our bundled
// sveltekit patch there (relative to the consumer's root) and let a follow-up install apply it.
const pkgPath = join(init, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const patchKey = '@sveltejs/kit@2.56.1';
const patchPath = relative(init, join(import.meta.dirname, '@sveltejs/kit@2.56.1.patch'));

pkg.patchedDependencies ??= {};

// Already registered: nothing to do (this also prevents recursion when the install below re-runs postinstall).
if (pkg.patchedDependencies[patchKey] === patchPath) process.exit(0);

pkg.patchedDependencies[patchKey] = patchPath;
writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');

execFileSync('npm', ['install'], { cwd: init, stdio: 'inherit' });
