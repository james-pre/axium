import { session } from '@axium/client/cli/config';
import { Option, program } from 'commander';
import * as io from 'ioium/node';
import { stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import { bytes as formatBytes } from 'utilium/format';
import * as z from 'zod';
import { SyncRule, syncRulesHelp } from '../../rules.js';
import * as api from '../api.js';
import { config, findSync, saveConfig } from '../config.js';
import { resolveItem, resolvePath } from '../local.js';
import type { ConflictMode, SyncOptions } from '../sync.js';
import { computeDelta, describeAction, doSync, fetchRemote, pullRules, removeSyncedState, summarizeActions } from '../sync.js';
import { hasTrash } from '../trash.js';
import * as commands from './commands.js';
import { rules } from './rules.js';
import filesShell from './shell.js';

const cli = program
	.command('files')
	.helpGroup('Plugins:')
	.description('CLI integration for @axium/storage')
	.addCommand(commands.ls)
	.addCommand(commands.mkdir)
	.addCommand(commands.remove)
	.addCommand(commands.upload)
	.addCommand(commands.download)
	.addCommand(rules);

cli.command('usage')
	.description('Show your usage')
	.action(async () => {
		const { limits, itemCount, usedBytes } = await api.getUserStats(session().userId);

		console.log(`Items: ${itemCount} ${limits.user_items ? ' / ' + limits.user_items : ''}`);
		console.log(`Space: ${formatBytes(usedBytes)} ${limits.user_size ? ' / ' + formatBytes(limits.user_size * 1_000_000n) : ''}`);
	});

cli.command('status')
	.description('Show pending changes in synced folders')
	.option('-v, --verbose', 'list each pending change')
	.argument('[sync]', 'name, local path, or remote path of a synced folder')
	.action(async (search: string | undefined, options: { verbose?: boolean }) => {
		const syncs = search ? [findSync(search)] : config.sync;
		if (!search) console.log(styleText('bold', `${syncs.length} synced folder(s):`));

		for (const sync of syncs) {
			const [remote] = await Promise.all([fetchRemote(sync), pullRules(sync)]).catch(e => {
				io.warn(`Could not fetch ${sync.name}, only showing local changes: ${io.errorText(e)}`);
				return [null];
			});
			const { actions } = await computeDelta(sync, remote);
			const last = styleText('dim', `(last synced ${sync.last_synced ? io.prettyDate(sync.last_synced) : 'never'})`);

			console.log(sync.local_path + ':', actions.length ? summarizeActions(actions) : styleText('blueBright', 'up to date'), last);
			if (options.verbose) for (const action of actions) console.log('\t' + describeAction(action));
		}

		saveConfig();
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

		const existing = await api.getSync(remote.id).catch((e: Error & { status?: number }) => {
			if (e.status != 404) throw e;
			return null;
		});

		if (existing && options.rule && existing.rules.join('\n') != rules.data.join('\n'))
			io.exit('This folder is already synced with different rules. Use `axc files rules` to change them.');

		const synced = existing ?? (await api.createSync(remote.id, { rules: rules.data }));
		await api.updateSyncDevice(remote.id, { host: hostname(), localPath, lastSynced: null });

		config.sync.push({
			name: remote.name,
			item: remote.id,
			local_path: localPath,
			last_synced: null,
			remote_path: remoteName,
			rules: synced.rules,
			trash: options.trash,
		});

		saveConfig();

		if (existing) console.log(`Using the ${existing.rules.length} rule(s) already set for this folder.`);
	});

cli.command('config')
	.description('Show or change the settings of a synced folder')
	.argument('<sync>', 'name, local path, or remote path of a synced folder')
	.option('--trash', 'move local files to the trash when they are deleted or overwritten by remote changes')
	.option('--no-trash', 'permanently delete local files instead of moving them to the trash')
	.option('--auto-trash', 'use the trash if one exists')
	.option('--hidden', 'leave the folder out of the root of Files')
	.option('--no-hidden', 'show the folder in the root of Files')
	.action(async (search: string, options: { trash?: boolean; autoTrash?: boolean; hidden?: boolean }) => {
		const sync = findSync(search);

		if (options.autoTrash) delete sync.trash;
		else if (options.trash !== undefined) sync.trash = options.trash;

		const remote = await (options.hidden === undefined
			? api.getSync(sync.item)
			: io.track('Saving', api.updateSync(sync.item, { hidden: options.hidden }))
		).catch(e => {
			if (options.hidden !== undefined) io.exit('Could not save: ' + io.errorText(e));
			io.warn('Could not fetch synced folder: ' + io.errorText(e));
			return null;
		});
		if (remote) sync.rules = remote.rules;
		saveConfig();

		const formatDate = (date: Date | null) => (date ? io.prettyDate(date) : 'never');
		const trash = sync.trash === undefined ? `auto (${hasTrash() ? 'on' : 'off'})` : sync.trash ? 'on' : 'off';

		console.log(styleText('bold', sync.name));
		console.log('Local path:  ' + sync.local_path);
		console.log('Remote path: ' + sync.remote_path);
		console.log('Rules:       ' + (sync.rules.length || 'none') + styleText('dim', ' (see `axc files rules`)'));
		console.log('Trash:       ' + trash);
		console.log('Last synced: ' + formatDate(sync.last_synced));

		if (!remote) return;

		console.log('Hidden:      ' + (remote.hidden ? 'yes' : 'no'));

		console.log('Devices:');
		for (const device of remote.devices) {
			const current = device.host == hostname() ? styleText('dim', ' (this device)') : '';
			console.log(`  ${device.host}${current}: ${device.localPath}, last synced ${formatDate(device.lastSynced)}`);
		}
	});

cli.command('unsync')
	.alias('remove-sync')
	.alias('rm-sync')
	.description('Stop syncing a folder')
	.argument('<sync>', 'name, local path, or remote path of the synced folder')
	.action(async (search: string) => {
		const sync = findSync(search);
		await api
			.removeSyncDevice(sync.item, hostname())
			.catch(e => io.warn('Could not remove this device from the synced folder: ' + io.errorText(e)));
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
