import { Logger, type LoggerConsole } from 'logzen';
import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path/posix';
import { styleText } from 'node:util';
import config from './config.js';

export const systemDir = '/etc/axium';
export const userDir = join(homedir(), '.axium');

export const dirs = [systemDir, userDir];
for (let dir = resolve(process.cwd()); dir !== '/'; dir = dirname(dir)) {
	if (fs.existsSync(join(dir, '.axium'))) dirs.push(join(dir, '.axium'));
}
if (process.env.AXIUM_DIR) dirs.push(process.env.AXIUM_DIR);

try {
	fs.mkdirSync(systemDir, { recursive: true });
} catch {
	// Missing permissions
}
fs.mkdirSync(userDir, { recursive: true });

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
		throw error == '[command]'
			? stderr?.slice(0, 100) || 'failed.'
			: typeof error == 'object' && 'message' in error
				? error.message
				: error;
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

export type OutputTag =
	// Log-style message
	| 'debug'
	| 'info'
	| 'warn'
	| 'error'
	// State
	| 'start'
	| 'done'
	| 'plugin';

export interface Output {
	(tag: 'done'): void;
	(tag: Exclude<OutputTag, 'done'>, message: string): void;
}

export interface MaybeOutput {
	output?: Output | null | false;
}

export interface WithOutput {
	output: Output;
}

export function defaultOutput(tag: 'done'): void;
export function defaultOutput(tag: Exclude<OutputTag, 'done'>, message: string): void;
export function defaultOutput(tag: OutputTag, message: string = ''): void {
	switch (tag) {
		case 'debug':
			config.debug && output.debug(message);
			break;
		case 'info':
			console.log(message);
			break;
		case 'warn':
			console.warn(styleText('yellow', message));
			break;
		case 'error':
			console.error(styleText('red', message));
			break;
		case 'start':
			process.stdout.write(message + '... ');
			break;
		case 'done':
			console.log('done.');
			break;
		case 'plugin':
			console.log(styleText('whiteBright', 'Running plugin: ' + message));
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
	node?: string;
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

			opt.output('debug', 'Using setcap at ' + setcap);

			let { node } = opt;
			node ||= await run(opt, 'Finding node', 'command -v node')
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

/**
 * This is a factory for handling errors when performing operations.
 * The handler will allow the parent scope to continue if a relation already exists,
 * rather than fatally exiting.
 */
export function someWarnings(output: Output, ...allowList: [RegExp, string?][]): (error: string | Error) => void {
	return (error: string | Error) => {
		error = typeof error == 'object' && 'message' in error ? error.message : error;
		for (const [pattern, message = error] of allowList) {
			if (!pattern.test(error)) continue;
			output('warn', message);
			return;
		}
		throw error;
	};
}
