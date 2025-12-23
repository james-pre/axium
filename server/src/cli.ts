// Supporting code for the CLI. The CLI entry point is main.ts

import type { UserInternal } from '@axium/core';
import { io } from '@axium/core/node';
import { styleText } from 'node:util';
import * as db from './database.js';
import * as z from 'zod';

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
