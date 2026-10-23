import * as locales from '@james-pre/locales';
import * as z from 'zod';

export const SyncRuleType = z.literal(['+', '-']).register(locales.zod, { prefix: 'storage.sync_rule' });

/** `+pattern` includes and `-pattern` excludes matching paths. */
export const SyncRule = z
	.templateLiteral([SyncRuleType, z.string().trim().nonempty()], { error: 'Rules must be + or - followed by a pattern' })
	.overwrite(rule => `${rule[0] as SyncRuleType}${rule.slice(1).trim()}` as const);

export type SyncRuleType = z.infer<typeof SyncRuleType>;

export type SyncRule = z.infer<typeof SyncRule>;

export const syncRulesHelp = `Rules:
  +pattern  include matching paths
  -pattern  exclude matching paths

  The last matching rule wins, and paths that match no rule are included.
  A rule that matches a folder also applies to everything inside it.
  A pattern without a slash matches a name at any depth, e.g. -node_modules
  A pattern with a slash is relative to the synced folder, e.g. +/projects
  A trailing slash only matches folders, e.g. -build/
  * matches any part of a name (including dotfiles), ** matches across folders,
  ? matches one character, and [abc] or [!abc] match a set of characters.`;

interface CompiledRule {
	readonly include: boolean;
	readonly anchored: boolean;
	readonly directoryOnly: boolean;
	/** `null` for `**` */
	readonly segments: (RegExp | null)[];
	readonly regex: RegExp;
}

function globSource(glob: string): string {
	let source = '';
	for (let i = 0; i < glob.length; i++) {
		const character = glob[i];
		if (character == '*' && glob[i + 1] == '*') {
			i++;
			if (glob[i + 1] == '/') {
				i++;
				source += '(?:.*/)?';
			} else source += '.*';
		} else if (character == '*') source += '[^/]*';
		else if (character == '?') source += '[^/]';
		else if (character == '[' && glob.indexOf(']', i + 2) != -1) {
			const end = glob.indexOf(']', i + 2);
			const set = glob.slice(i + 1, end).replaceAll('\\', '\\\\');
			source += '[' + (set[0] == '!' ? '^' + set.slice(1) : set) + ']';
			i = end;
		} else source += character.replace(/[.*+?^${}()|[\]\\/]/, '\\$&');
	}
	return source;
}

function compile(rule: string): CompiledRule {
	let pattern = rule.slice(1);
	const directoryOnly = pattern.endsWith('/');
	if (directoryOnly) pattern = pattern.slice(0, -1);
	const anchored = pattern.includes('/');
	if (pattern.startsWith('/')) pattern = pattern.slice(1);

	return {
		include: rule[0] == '+',
		anchored,
		directoryOnly,
		segments: pattern.split('/').map(segment => (segment.includes('**') ? null : new RegExp('^' + globSource(segment) + '$'))),
		regex: new RegExp('^' + globSource(pattern) + '$'),
	};
}

function matches(rule: CompiledRule, segments: string[], isDirectory: boolean): boolean {
	for (let i = 1; i <= segments.length; i++) {
		if (rule.directoryOnly && i == segments.length && !isDirectory) continue;
		if (rule.regex.test(rule.anchored ? segments.slice(0, i).join('/') : segments[i - 1])) return true;
	}
	return false;
}

/** Whether an anchored rule could match something inside the folder at `segments`. */
function couldMatchInside(rule: CompiledRule, segments: string[]): boolean {
	for (const [i, segment] of segments.entries()) {
		const pattern = rule.segments[i];
		if (!pattern) return true;
		if (!pattern.test(segment)) return false;
	}
	return true;
}

export class SyncRules {
	protected readonly rules: CompiledRule[];

	constructor(rules: readonly string[]) {
		this.rules = rules.map(compile);
	}

	/** The index of the rule that decides whether a path is synced, or -1 if no rule matches. */
	match(path: string, isDirectory: boolean): number {
		const segments = path.split('/');
		return this.rules.findLastIndex(rule => matches(rule, segments, isDirectory));
	}

	includes(path: string, isDirectory: boolean): boolean {
		const index = this.match(path, isDirectory);
		return index == -1 || this.rules[index].include;
	}

	/** Whether an excluded folder could still contain included items. */
	shouldDescend(path: string): boolean {
		const segments = path.split('/');
		const decidedBy = this.rules.findLastIndex(rule => matches(rule, segments, true));
		return this.rules.slice(decidedBy + 1).some(rule => rule.include && (!rule.anchored || couldMatchInside(rule, segments)));
	}
}

/** Finds items synced by `before` but excluded by `after`, leaving out the contents of folders that are found. */
export function newlyExcluded<T extends { directory: boolean }>(items: Map<string, T>, before: SyncRules, after: SyncRules): [string, T][] {
	const excluded: [string, T][] = [];

	for (const [path, item] of items
		.entries()
		.toArray()
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		if (!before.includes(path, item.directory) || after.includes(path, item.directory)) continue;
		if (item.directory && after.shouldDescend(path)) continue;
		if (excluded.some(([folder]) => path.startsWith(folder + '/'))) continue;
		excluded.push([path, item]);
	}

	return excluded;
}
