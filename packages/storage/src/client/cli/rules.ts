import { Command } from 'commander';
import * as io from 'ioium/node';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { styleText } from 'node:util';
import * as z from 'zod';
import { SyncRule, SyncRules, syncRulesHelp } from '../../rules.js';
import { setSyncRules } from '../api.js';
import { findSync, saveConfig } from '../config.js';
import { pullRules, type Sync } from '../sync.js';

function colorRule(rule: string): string {
	return styleText(rule[0] == '+' ? 'green' : 'red', rule);
}

async function saveRules(sync: Sync, rules: string[]): Promise<void> {
	const parsed = SyncRule.array().safeParse(rules);
	if (!parsed.success) io.exit(z.prettifyError(parsed.error));
	const updated = await io.track('Saving rules', setSyncRules(sync.item, parsed.data));
	sync.rules = updated.rules;
	saveConfig();
}

/** Finds a Sync and updates its rules from the server. */
async function syncWithRules(search: string): Promise<Sync> {
	const sync = findSync(search);
	await io.track('Fetching rules', pullRules(sync));
	saveConfig();
	return sync;
}

function listRules(sync: Sync): void {
	if (!sync.rules.length) {
		console.log(styleText('dim', 'No rules, everything is synced.'));
		return;
	}
	const width = sync.rules.length.toString().length;
	for (const [i, rule] of sync.rules.entries()) console.log(styleText('dim', (i + 1).toString().padStart(width)), colorRule(rule));
}

export const rules = new Command('rules')
	.description('Manage which paths are synced')
	.addHelpText('after', '\n' + syncRulesHelp + '\n\nRules are shared by every device syncing the folder.');

rules
	.command('list')
	.alias('ls')
	.description('List the rules for a synced folder, in order')
	.argument('<sync>', 'name, local path, or remote path of a synced folder')
	.action(async (search: string) => {
		const sync = await syncWithRules(search).catch(e => {
			io.warn('Could not fetch rules, showing cached rules: ' + io.errorText(e));
			return findSync(search);
		});
		listRules(sync);
	});

for (const [name, sign] of [
	['include', '+'],
	['exclude', '-'],
] as const) {
	rules
		.command(name)
		.description(`Add rules that ${name} paths matching patterns`)
		.argument('<sync>', 'name, local path, or remote path of a synced folder')
		.argument('<pattern...>', 'patterns to match')
		.option('--at <position>', 'insert at a position instead of at the end', Number.parseInt)
		.action(async (search: string, patterns: string[], options: { at?: number }) => {
			const sync = await syncWithRules(search);
			const updated = sync.rules.slice();
			updated.splice(options.at ? options.at - 1 : updated.length, 0, ...patterns.map(pattern => sign + pattern));
			await saveRules(sync, updated);
			listRules(sync);
		});
}

rules
	.command('remove')
	.alias('rm')
	.description('Remove rules from a synced folder')
	.argument('<sync>', 'name, local path, or remote path of a synced folder')
	.argument('<rule...>', 'rules or their positions, put rules starting with - after --')
	.action(async (search: string, removed: string[]) => {
		const sync = await syncWithRules(search);

		const indices = new Set<number>();
		for (const rule of removed) {
			const index = /^\d+$/.test(rule) ? parseInt(rule) - 1 : sync.rules.indexOf(rule);
			if (!(index in sync.rules)) io.exit('No such rule: ' + rule);
			indices.add(index);
		}

		await saveRules(
			sync,
			sync.rules.filter((_, i) => !indices.has(i))
		);
		listRules(sync);
	});

rules
	.command('edit')
	.description('Edit the rules for a synced folder in your editor')
	.argument('<sync>', 'name, local path, or remote path of a synced folder')
	.action(async (search: string) => {
		const sync = await syncWithRules(search);

		using directory = fs.mkdtempDisposableSync(join(tmpdir(), 'axium-rules-'));
		const file = join(directory.path, 'rules');
		const help = syncRulesHelp.replaceAll(/^/gm, '# ');
		fs.writeFileSync(file, `${sync.rules.join('\n')}\n\n# Lines starting with # are ignored.\n${help}\n`);

		const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
		const result = spawnSync(`${editor} '${file}'`, { shell: true, stdio: 'inherit' });
		if (result.status) io.exit('Editor exited with code ' + result.status);

		const edited = fs
			.readFileSync(file, 'utf8')
			.split('\n')
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'));

		if (edited.join('\n') == sync.rules.join('\n')) {
			console.log('No changes.');
			return;
		}

		await saveRules(sync, edited);
		listRules(sync);
	});

rules
	.command('check')
	.description('Show whether paths are synced, and which rule decides')
	.argument('<sync>', 'name, local path, or remote path of a synced folder')
	.argument('<path...>', 'local paths, or paths relative to the synced folder')
	.action(async (search: string, paths: string[]) => {
		const sync = await syncWithRules(search).catch(e => {
			io.warn('Could not fetch rules, using cached rules: ' + io.errorText(e));
			return findSync(search);
		});
		const matcher = new SyncRules(sync.rules);

		for (const path of paths) {
			const absolute = resolve(path);
			const inside = absolute.startsWith(sync.local_path + '/');
			const local = inside ? absolute : join(sync.local_path, path);
			const relativePath = relative(sync.local_path, local);
			const isDirectory = path.endsWith('/') || !!fs.statSync(local, { throwIfNoEntry: false })?.isDirectory();

			const index = matcher.match(relativePath, isDirectory);
			const included = matcher.includes(relativePath, isDirectory);
			const reason = index == -1 ? 'no rule matches' : `rule ${index + 1}: ${sync.rules[index]}`;
			const contents = !included && isDirectory && matcher.shouldDescend(relativePath) ? ', but some contents may be' : '';

			console.log(
				styleText(included ? 'green' : 'red', `${included ? 'synced' : 'not synced'}${contents}:`),
				relativePath,
				styleText('dim', `(${reason})`)
			);
		}
	});
