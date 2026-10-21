import { session } from '@axium/client/cli/config';
import { Option, program } from 'commander';
import * as io from 'ioium/node';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import { bytes as formatBytes } from 'utilium/format';
import * as z from 'zod';
import { SyncRule, syncRulesHelp } from '../../rules.js';
import * as api from '../api.js';
import { config, saveConfig } from '../config.js';
import { resolveItem, resolvePath } from '../local.js';
import type { ConflictMode, Sync, SyncOptions } from '../sync.js';
import { computeDelta, describeAction, doSync, fetchRemote, removeSyncedState, summarizeActions } from '../sync.js';
import * as commands from './commands.js';
import filesShell from './shell.js';

const cli = program
	.command('files')
	.helpGroup('Plugins:')
	.description('CLI integration for @axium/storage')
	.addCommand(commands.ls)
	.addCommand(commands.mkdir)
	.addCommand(commands.remove)
	.addCommand(commands.upload)
	.addCommand(commands.download);

cli.command('usage')
	.description('Show your usage')
	.action(async () => {
		const { limits, itemCount, usedBytes } = await api.getUserStats(session().userId);

		console.log(`Items: ${itemCount} ${limits.user_items ? ' / ' + limits.user_items : ''}`);
		console.log(`Space: ${formatBytes(usedBytes)} ${limits.user_size ? ' / ' + formatBytes(limits.user_size * 1_000_000n) : ''}`);
	});

/** Find a Sync by its name, local path, or remote path. */
function findSync(search: string): Sync {
	const local = resolve(search);
	const remote = resolvePath(search);
	const sync = config.sync.find(
		candidate => candidate.local_path == local || candidate.name == search || candidate.remote_path == remote
	);
	if (!sync) io.exit('Can not find a synced folder matching ' + search);
	return sync;
}

cli.command('status')
	.description('Show pending changes in synced folders')
	.option('-v, --verbose', 'list each pending change')
	.argument('[sync]', 'name, local path, or remote path of a synced folder')
	.action(async (search: string | undefined, options: { verbose?: boolean }) => {
		const syncs = search ? [findSync(search)] : config.sync;
		if (!search) console.log(styleText('bold', `${syncs.length} synced folder(s):`));

		for (const sync of syncs) {
			const remote = await fetchRemote(sync).catch(e => {
				io.warn(`Could not fetch ${sync.name}, only showing local changes: ${io.errorText(e)}`);
				return null;
			});
			const { actions } = await computeDelta(sync, remote);
			const last = styleText('dim', `(last synced ${sync.last_synced ? io.prettyDate(sync.last_synced) : 'never'})`);

			console.log(sync.local_path + ':', actions.length ? summarizeActions(actions) : styleText('blueBright', 'up to date'), last);
			if (options.verbose) for (const action of actions) console.log('\t' + describeAction(action));
		}
	});

cli.command('shell').description('Open an interactive shell').action(filesShell);

cli.command('trash')
	.description('Trash a file or folder')
	.argument('<path>', 'remote path to trash')
	.action(async (path: string) => {
		const item = resolveItem(path);
		if (!item) io.exit('Could not resolve path.');
		await api.updateItemMetadata(item.id, { trash: true });
	});

cli.command('untrash')
	.description('Restore a trashed file or folder')
	.argument('<path>', 'remote path to restore')
	.action(async (path: string) => {
		const item = resolveItem(path);
		if (!item) io.exit('Could not resolve path.');
		await api.updateItemMetadata(item.id, { trash: false });
	});

// sync commands //

cli.command('add')
	.description('Add a folder to be synced')
	.argument('<path>', 'local path to the folder to sync')
	.argument('<remote>', 'remote folder path')
	.option('-r, --rule <rule...>', 'rules for which paths to sync')
	.option('--trash', 'move local files to the trash when they are deleted remotely')
	.option('--no-trash', 'permanently delete local files when they are deleted remotely')
	.addHelpText('after', '\n' + syncRulesHelp)
	.action(async (localPath: string, remoteName: string, options) => {
		localPath = resolve(localPath);
		remoteName = resolvePath(remoteName);

		for (const sync of config.sync) {
			if (sync.local_path == localPath || localPath.startsWith(sync.local_path + '/'))
				io.exit('This local path is already being synced.');
			if (sync.remote_path == remoteName || remoteName.startsWith(sync.remote_path + '/'))
				io.exit('This remote path is already being synced.');
		}

		const local = await stat(localPath).catch(e => io.exit(e.toString()));
		if (!local.isDirectory()) io.exit('Local path is not a directory.');

		const remote = resolveItem(remoteName);
		if (!remote) io.exit('Could not resolve remote path.');
		if (remote.type != 'inode/directory') io.exit('Remote path is not a directory.');

		const rules = SyncRule.array().safeParse(options.rule ?? []);
		if (!rules.success) io.exit(z.prettifyError(rules.error));

		config.sync.push({
			name: remote.name,
			item: remote.id,
			local_path: localPath,
			last_synced: null,
			remote_path: remoteName,
			rules: rules.data,
			trash: options.trash,
		});

		saveConfig();
	});

cli.command('unsync')
	.alias('remove-sync')
	.alias('rm-sync')
	.description('Stop syncing a folder')
	.argument('<sync>', 'name, local path, or remote path of the synced folder')
	.action((search: string) => {
		const sync = findSync(search);
		removeSyncedState(sync);
		config.sync.splice(config.sync.indexOf(sync), 1);
		saveConfig();
	});

cli.command('sync')
	.description('Sync files')
	.addOption(
		new Option('-c, --conflicts <mode>', 'how to resolve files changed both locally and remotely')
			.choices(['ask', 'both', 'local', 'remote', 'skip'] satisfies ConflictMode[])
			.default(process.stdin.isTTY && process.stdout.isTTY ? 'ask' : 'both')
	)
	.option('-d, --dry-run', 'show what would be done, but do not make any changes', false)
	.option('-v, --verbose', 'list each change', false)
	.option('--trash', 'move local files to the trash when they are deleted or overwritten by remote changes')
	.option('--no-trash', 'permanently delete local files instead of moving them to the trash')
	.argument('[sync]', 'name, local path, or remote path of a synced folder')
	.addHelpText('after', '\n' + syncRulesHelp)
	.action(async (search: string | undefined, options: SyncOptions) => {
		let failed = false;

		for (const sync of search ? [findSync(search)] : config.sync) {
			try {
				const stats = await doSync(sync, options);
				failed ||= !!stats.failed.length;
			} catch (e) {
				io.error(`${sync.name}: ${io.errorText(e)}`);
				failed = true;
			}
		}

		if (!options.dryRun) saveConfig();
		if (failed) process.exitCode = 1;
	});
