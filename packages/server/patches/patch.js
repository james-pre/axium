import { relative, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// If this package is installed as a dependency (inside node_modules),
// we want to run patch-package from the consumer's root directory (INIT_CWD).
const cwd = process.cwd();
const init = cwd.includes('node_modules') ? process.env.INIT_CWD || cwd : cwd;

// no consumer project (global or standalone install)
if (process.env.npm_config_global === 'true' || !existsSync(join(init, 'node_modules'))) process.exit(0);

const patchesRelativePath = relative(init, join(cwd, 'patches'));

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(npx, ['patch-package', '--patch-dir', patchesRelativePath], { cwd: init, stdio: 'inherit' });
