import { debug, done, output, run, start, warn } from '@axium/core/node/io';
import { Logger } from 'logzen';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { _unique } from './state.js';

export const systemDir = '/etc/axium';

export const dirs = _unique('dirs', [systemDir]);
for (let dir = resolve(process.cwd()); dir !== '/'; dir = dirname(dir)) {
	if (fs.existsSync(join(dir, '.axium'))) dirs.push(join(dir, '.axium'));
}
if (process.env.AXIUM_DIR) dirs.push(process.env.AXIUM_DIR);

try {
	fs.mkdirSync(systemDir, { recursive: true });
} catch {
	// Missing permissions
}

export const logger = new Logger({
	hideWarningStack: true,
	noGlobalConsole: true,
});

logger.attach(output);

/** @internal */
export const _portMethods = ['node-cap'] as const;
/** @internal */
export const _portActions = ['enable', 'disable'] as const;

/**
 * Options for working with restricted ports.
 *
 * Method:
 * - `node-cap`: Use the `cap_net_bind_service` capability on the node binary.
 */
export interface PortOptions {
	method: (typeof _portMethods)[number];
	action: (typeof _portActions)[number];
	node?: string;
}

/**
 * This changes if Axium can use restricted ports (like 80 and 443) without root privileges.
 * Use of these ports is needed so the origin doesn't have a port.
 * If the origin has a port, passkeys do not work correctly with some password managers.
 */
export async function restrictedPorts(opt: PortOptions) {
	start('Checking for root privileges');
	if (process.getuid?.() != 0) throw 'root privileges are needed to change restricted ports.';
	done();

	start('Checking ports method');
	if (!_portMethods.includes(opt.method)) throw 'invalid';
	done();

	start('Checking ports action');
	if (!_portActions.includes(opt.action)) throw 'invalid';
	done();

	switch (opt.method) {
		case 'node-cap': {
			const setcap = await run('Finding setcap', 'command -v setcap')
				.then(e => e.trim())
				.catch(() => {
					warn('not in path.');
					start('Checking for /usr/sbin/setcap');
					fs.accessSync('/usr/sbin/setcap', fs.constants.X_OK);
					done();
					return '/usr/sbin/setcap';
				});

			debug('Using setcap at ' + setcap);

			let { node } = opt;
			node ||= await run('Finding node', 'command -v node')
				.then(e => e.trim())
				.catch(() => {
					warn('not in path.');
					start('Checking for /usr/bin/node');
					fs.accessSync('/usr/bin/node', fs.constants.X_OK);
					done();
					return '/usr/bin/node';
				});

			start('Resolving real path for node');
			node = fs.realpathSync(node);
			done();

			debug('Using node at ' + node);

			await run('Setting ports capability', `${setcap} cap_net_bind_service=${opt.action == 'enable' ? '+' : '-'}ep ${node}`);

			break;
		}
	}
}
