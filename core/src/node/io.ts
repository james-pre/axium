import { exec } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { styleText } from 'node:util';
import { _debugOutput, done, error, start, useOutput } from '../io.js';
export * from '../io.js';

useOutput({
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
});

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
	error(message);
	process.exit(code);
}

export function handleError(e: number | string | Error) {
	if (typeof e == 'number') process.exit(e);
	else exit(e);
}

export function writeJSON(path: string, data: any) {
	writeFileSync(
		path,
		JSON.stringify(data, null, 4).replaceAll(/^( {4})+/g, match => '\t'.repeat(match.length / 4)),
		'utf-8'
	);
}
