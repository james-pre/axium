import { Logger, type LoggerConsole } from 'logzen';
import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path/posix';
import { styleText } from 'node:util';
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

/**
 * @internal
 */
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
		_debugOutput && console.debug(message.startsWith('\x1b') ? message : styleText('gray', message));
	},
} satisfies LoggerConsole;

logger.attach(output);

let timeout = 1000;

export function setCommandTimeout(value: number) {
	timeout = value;
}

/**
 * Run a system command with the fancy "Example... done."
 * @internal
 */
export async function run(message: string, command: string): Promise<string> {
	let stderr: string | undefined;

	try {
		start(message);
		const { promise, resolve, reject } = Promise.withResolvers<string>();
		exec(command, { timeout }, (err, stdout, _stderr) => {
			stderr = _stderr.startsWith('ERROR:') ? _stderr.slice(6).trim() : _stderr;
			if (err) reject('[command]');
			else resolve(stdout);
		});
		const value = await promise;
		done();
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

export let _debugOutput = false;

/**
 * Enable or disable debug output.
 */
export function _setDebugOutput(enabled: boolean) {
	_debugOutput = enabled;
}

function defaultOutput(tag: 'done'): void;
function defaultOutput(tag: Exclude<OutputTag, 'done'>, message: string): void;
function defaultOutput(tag: OutputTag, message: string = ''): void {
	switch (tag) {
		case 'debug':
			_debugOutput && output.debug(message);
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

let _taggedOutput: Output | null = defaultOutput;

export function useTaggedOutput(output: Output | null) {
	_taggedOutput = output;
}

// Shortcuts for tagged output

export function done() {
	_taggedOutput?.('done');
}

export function start(message: string) {
	_taggedOutput?.('start', message);
}

export function plugin(name: string) {
	_taggedOutput?.('plugin', name);
}

export function debug(message: string) {
	_taggedOutput?.('debug', message);
}

export function info(message: string) {
	_taggedOutput?.('info', message);
}

export function warn(message: string) {
	_taggedOutput?.('warn', message);
}

export function error(message: string) {
	_taggedOutput?.('error', message);
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

/**
 * This is a factory for handling errors when performing operations.
 * The handler will allow the parent scope to continue if a relation already exists,
 * rather than fatally exiting.
 */
export function someWarnings(...allowList: [RegExp, string?][]): (error: string | Error) => void {
	return (error: string | Error) => {
		error = typeof error == 'object' && 'message' in error ? error.message : error;
		for (const [pattern, message = error] of allowList) {
			if (!pattern.test(error)) continue;
			warn(message);
			return;
		}
		throw error;
	};
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Shortcut to convert to 2-digit. Mostly used to make the line shorter.
const _2 = (v: number) => v.toString().padStart(2, '0');

/**
 * Get a human-readable string for a date that also fits into CLIs well (fixed-width)
 */
export function prettyDate(date: Date): string {
	return `${date.getFullYear()} ${months[date.getMonth()]} ${_2(date.getDate())} ${_2(date.getHours())}:${_2(date.getMinutes())}:${_2(date.getSeconds())}.${date.getMilliseconds().toString().padStart(3, '0')}`;
}
