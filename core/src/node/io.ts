import { exec } from 'node:child_process';
import { styleText } from 'node:util';

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
};

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
