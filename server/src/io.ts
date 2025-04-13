import { Logger, type LoggerConsole } from 'logzen';
import { createWriteStream, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import { styleText } from 'node:util';

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

if (process.getuid?.() === 0) mkdirSync('/etc/axium', { recursive: true });

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

export function attachLogFiles(): void {
	const logDir = join(findDir(false), 'logs');
	mkdirSync(logDir, { recursive: true });

	logger.attach(createWriteStream(join(logDir, 'latest.log')));
	logger.attach(createWriteStream(join(logDir, new Date().toISOString() + '.log')));
}

/** Yet another convenience function */
export function exit(message: string | Error, code: number = 1): never {
	if (message instanceof Error) message = message.message;
	output.error(message);
	process.exit(code);
}

/** Convenience function for `example... [done. / error]` */
export async function report<T>(promise: Promise<T>, message: string, success: string = 'done.'): Promise<T> {
	process.stdout.write(message + '... ');

	try {
		const result = await promise;
		console.log(success);
		return result;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}
