import { Logger, type LoggerConsole } from 'logzen';
import { exec, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import { styleText } from 'node:util';
import { debug } from './config.js';

/**
 * Find the Axium directory.
 * This directory includes things like config files, secrets, etc.
 */
export function findDir(global: boolean): string {
	if (process.env.AXIUM_DIR) return process.env.AXIUM_DIR;
	if (global && process.getuid?.() === 0) return '/etc/axium';
	if (global) return join(homedir(), '.axium');
	return '.axium';
}

if (process.getuid?.() === 0) fs.mkdirSync('/etc/axium', { recursive: true });
fs.mkdirSync(findDir(false), { recursive: true });

export const logger = new Logger({
	hideWarningStack: true,
	noGlobalConsole: true,
});

export const output = {
	constructor: { name: 'Console' },
	error(message: string): void {
		console.error(message.startsWith('\x1b') ? message : styleText('red', message));
	},
	warn(message: string): void {
		console.warn(message.startsWith('\x1b') ? message : styleText('yellow', message));
	},
	info(message: string): void {
		console.info(message.startsWith('\x1b') ? message : styleText('blue', message));
	},
	log(message: string): void {
		console.log(message);
	},
	debug(message: string): void {
		console.debug(message.startsWith('\x1b') ? message : styleText('gray', message));
	},
} satisfies LoggerConsole;

logger.attach(output);

/**
 * Run a system command with the fancy "Example... done."
 * @internal
 */
export async function run(opts: WithOutput & { timeout?: number }, message: string, command: string): Promise<string> {
	let stderr: string | undefined;

	try {
		opts.output('start', message);
		const { promise, resolve, reject } = Promise.withResolvers<string>();
		exec(command, opts, (err, stdout, _stderr) => {
			stderr = _stderr.startsWith('ERROR:') ? _stderr.slice(6).trim() : _stderr;
			if (err) reject('[command]');
			else resolve(stdout);
		});
		const value = await promise;
		opts.output('done');
		return value;
	} catch (error: any) {
		throw error == '[command]' ? stderr?.slice(0, 100) || 'failed.' : typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

/** Yet another convenience function */
export function exit(message: string | Error, code: number = 1): never {
	if (message instanceof Error) message = message.message;
	output.error(message);
	process.exit(code);
}

export function handleError(e: number | string | Error) {
	if (typeof e == 'number') process.exit(e);
	else exit(e);
}

export type OutputState = 'done' | 'log' | 'warn' | 'error' | 'start' | 'debug';

export interface Output {
	(state: 'done'): void;
	(state: Exclude<OutputState, 'done'>, message: string): void;
}

export interface MaybeOutput {
	output?: Output | null | false;
}

export interface WithOutput {
	output: Output;
}

export function defaultOutput(state: 'done'): void;
export function defaultOutput(state: Exclude<OutputState, 'done'>, message: string): void;
export function defaultOutput(state: OutputState, message: string = ''): void {
	switch (state) {
		case 'start':
			process.stdout.write(message + '... ');
			break;
		case 'debug':
			debug && output.debug(message);
			break;
		case 'log':
			console.log(message);
			break;
		case 'warn':
			process.stdout.write(styleText('yellow', message));
			break;
		case 'error':
			process.stdout.write(styleText('red', message));
			break;
		case 'done':
			console.log('done.');
			break;
	}
}

/**
 * TS can't tell when we do this inline
 * @internal
 */
export function _fixOutput<T extends MaybeOutput>(opt: T): asserts opt is T & WithOutput {
	if (opt.output === false) opt.output = () => {};
	else opt.output ??= defaultOutput;
}

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
export interface PortOptions extends MaybeOutput {
	method: (typeof _portMethods)[number];
	action: (typeof _portActions)[number];
}

/**
 * This changes if Axium can use restricted ports (like 80 and 443) without root privileges.
 * Use of these ports is needed so the origin doesn't have a port.
 * If the origin has a port, passkeys do not work correctly with some password managers.
 */
export async function restrictedPorts(opt: PortOptions) {
	_fixOutput(opt);
	opt.output('start', 'Checking for root privileges');
	if (process.getuid?.() != 0) throw 'root privileges are needed to change restricted ports.';
	opt.output('done');

	opt.output('start', 'Checking ports method');
	if (!_portMethods.includes(opt.method)) throw 'invalid';
	opt.output('done');

	opt.output('start', 'Checking ports action');
	if (!_portActions.includes(opt.action)) throw 'invalid';
	opt.output('done');

	switch (opt.method) {
		case 'node-cap': {
			const setcap = await run(opt, 'Finding setcap', 'command -v setcap')
				.then(e => e.trim())
				.catch(() => {
					opt.output('warn', 'not in path.');
					opt.output('start', 'Checking for /usr/sbin/setcap');
					fs.accessSync('/usr/sbin/setcap', fs.constants.X_OK);
					opt.output('done');
					return '/usr/sbin/setcap';
				});

			opt.output('debug', 'Using setup at ' + setcap);

			let node = await run(opt, 'Finding node', 'command -v node')
				.then(e => e.trim())
				.catch(() => {
					opt.output('warn', 'not in path.');
					opt.output('start', 'Checking for /usr/bin/node');
					fs.accessSync('/usr/bin/node', fs.constants.X_OK);
					opt.output('done');
					return '/usr/bin/node';
				});

			opt.output('start', 'Resolving real path for node');
			node = fs.realpathSync(node);
			opt.output('done');

			opt.output('debug', 'Using node at ' + node);

			await run(opt, 'Setting ports capability', `${setcap} cap_net_bind_service=${opt.action == 'enable' ? '+' : '-'}ep ${node}`);

			break;
		}
	}
}
