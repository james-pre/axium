// Supporting code for the CLI. The CLI entry point is main.ts

import type { UserInternal } from '@axium/core';
import * as io from 'ioium/node';
import { styleText } from 'node:util';
import * as z from 'zod';
import * as db from '../db/index.js';
import { Option } from 'commander';
import { createInterface } from 'node:readline/promises';

export function userText(user: UserInternal, bold: boolean = false): string {
	const text = `${user.name} <${user.email}> (${user.id})`;
	return bold ? styleText('bold', text) : text;
}

export async function lookupUser(lookup: string): Promise<UserInternal> {
	const value = await (lookup.includes('@') ? z.email() : z.uuid())
		.parseAsync(lookup.toLowerCase())
		.catch(() => io.exit('Invalid user ID or email.'));

	const result = await db
		.connect()
		.selectFrom('users')
		.where(value.includes('@') ? 'email' : 'id', '=', value)
		.selectAll()
		.executeTakeFirst();

	if (!result) io.exit('No user with matching ID or email.');

	return result;
}

/**
 * Updates an array of strings by adding or removing items.
 * Only returns whether the array was updated and diff text for what actually changed.
 */
export function diffUpdate(
	original: string[],
	add?: string[],
	remove?: string[]
): [updated: boolean, newValue: string[], diffText: string] {
	const diffs: string[] = [];

	// update the values
	if (add) {
		for (const role of add) {
			if (original.includes(role)) continue;
			original.push(role);
			diffs.push(styleText('green', '+' + role));
		}
	}
	if (remove)
		original = original.filter(item => {
			const allow = !remove.includes(item);
			if (!allow) diffs.push(styleText('red', '-' + item));
			return allow;
		});

	return [!!diffs.length, original, diffs.join(', ')];
}

// Options shared by multiple (sub)commands
export const sharedOptions = {
	check: new Option('--check', 'check the database schema after initialization').default(false),
	force: new Option('-f, --force', 'force the operation').default(false),
	global: new Option('-g, --global', 'apply the operation globally').default(false),
	timeout: new Option('-t, --timeout <ms>', 'how long to wait for commands to complete.').default(1000).argParser(value => {
		const timeout = parseInt(value);
		if (!Number.isSafeInteger(timeout) || timeout < 0) io.warn('Invalid timeout value, using default.');
		io.setCommandTimeout(timeout);
	}),
};

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

export { rl };

export async function rlConfirm(question: string = 'Is this ok'): Promise<void> {
	const { data, error } = z
		.stringbool()
		.default(false)
		.safeParse(await rl.question(question + ' [y/N]: ').catch(() => io.exit('Aborted.')));
	if (error || !data) io.exit('Aborted.');
}
