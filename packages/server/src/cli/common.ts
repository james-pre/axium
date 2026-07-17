// Supporting code for the CLI. The CLI entry point is main.ts

import { Username, type UserInternal } from '@axium/core';
import { Option } from 'commander';
import * as io from 'ioium/node';
import { matchesGlob } from 'node:path';
import { styleText } from 'node:util';
import * as z from 'zod';
import * as db from '../db/index.js';

export function userText(user: UserInternal, bold: boolean = false): string {
	const text = `${user.name} <${user.username}> (${user.id})`;
	return bold ? styleText('bold', text) : text;
}

export async function lookupUser(lookup: string): Promise<UserInternal> {
	lookup = lookup.toLowerCase();
	const column = lookup.includes('@') ? 'email' : z.uuid().safeParse(lookup).success ? 'id' : 'username';

	const value = await (column == 'email' ? z.email() : column == 'id' ? z.uuid() : Username)
		.parseAsync(lookup)
		.catch(() => io.exit('Invalid user ID, username, or email.'));

	const results = await db.connect().selectFrom('users').where(column, '=', value).selectAll().execute();

	if (!results.length) io.exit('No user with matching ID, username, or email.');
	if (results.length > 1) io.exit(`Multiple users matched:\n${results.map(user => '\t' + userText(user)).join('\n')}`);

	return results[0];
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

export function matchesGitGlob(path: string, pattern: string): boolean {
	pattern = pattern.at(-1) === '/' ? pattern.slice(0, -1) : pattern;

	const isRooted = pattern[0] === '/';
	const rel = isRooted ? pattern.slice(1) : pattern;

	return rel.includes('/') || isRooted
		? path === rel || path.startsWith(rel + '/') || matchesGlob(path, rel) || matchesGlob(path, rel + '/**')
		: path.split('/').includes(rel) || matchesGlob(path, '**/' + rel) || matchesGlob(path, '**/' + rel + '/**');
}

/**
 * Matches a path against a set of patterns.
 * Negated patterns clear previous matches.
 */
export function matchesGitGlobs(path: string, patterns: string[]): boolean {
	let matched = false;
	for (let pattern of patterns) {
		const negated = pattern.startsWith('!');
		if (negated) pattern = pattern.slice(1);
		if (matchesGitGlob(path, pattern)) matched = !negated;
	}
	return matched;
}

// Options shared by multiple (sub)commands
export const sharedOptions = {
	check: new Option('--check', 'check the database schema after initialization').default(false),
	force: new Option('-f, --force', 'force the operation').default(false),
	global: new Option('-g, --global', 'apply the operation globally').default(false),
	assumeYes: new Option('-y, --assume-yes', 'assume yes for all prompts').default(false),
};
