import chalk from 'chalk';
import { Logger } from 'logzen';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path/posix';
import { debug } from './config.js';

/** Convenience function for `example... [Done. / error]` */
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

export function err(message: string | Error): void {
	if (message instanceof Error) message = message.message;
	console.error(message.startsWith('\x1b') ? message : chalk.red(message));
}

/** Yet another convenience function */
export function exit(message: string | Error, code: number = 1): never {
	err(message);
	process.exit(code);
}

export function verbose(...message: any[]) {
	if (!debug) return;
	console.debug(chalk.gray(message));
}

/**
 * Find the Axium directory.
 * This directory includes things like config files, secrets, etc.
 */
export function findDir(global: boolean): string {
	if (process.env.AXIUM_DIR) return process.env.AXIUM_DIR;
	if (process.getuid?.() === 0) return '/etc/axium';
	if (global) return join(homedir(), '.axium');
	return '.axium';
}

/**
 *
 */
export function checkDir(path: string) {
	if (existsSync(path)) return;
	mkdirSync(path, { recursive: true });
}

if (process.getuid?.() === 0) checkDir('/etc/axium');

export const log = new Logger({
	hideWarningStack: true,
});
