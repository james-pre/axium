import { configDir, session } from '@axium/client/cli/config';
import { formatBytes } from '@axium/core/format';
import * as io from '@axium/core/node/io';
import { Option, program } from 'commander';
import { statSync, unlinkSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { styleText } from 'node:util';
import * as api from './api.js';
import { config, saveConfig } from './config.js';
import { walkItems } from './paths.js';
import { computeDelta, doSync, fetchSyncItems, type SyncOptions } from './sync.js';

const cli = program.command('files').helpGroup('Plugins:').description('CLI integration for @axium/storage');

cli.command('usage')
	.description('Show your usage')
	.action(async () => {
		const { limits, itemCount, usedBytes } = await api.getUserStats(session().userId);

		console.log(`Items: ${itemCount} ${limits.user_items ? ' / ' + limits.user_items : ''}`);
		console.log(`Space: ${formatBytes(usedBytes)} ${limits.user_size ? ' / ' + formatBytes(limits.user_size * 1_000_000) : ''}`);
	});

cli.command('ls')
	.alias('list')
	.description('List the contents of a folder')
	.action(() => {
		io.error('Not implemented yet.');
	});

cli.command('status')
	.option('-v, --verbose', 'Show more details')
	.option('--refresh', 'Force refresh metadata from the server')
	.action(async opt => {
		console.log(styleText('bold', `${config.sync.length} synced folder(s):`));
		for (const sync of config.sync) {
			if (opt.refresh) await fetchSyncItems(sync.item, sync.name);
			const delta = computeDelta(sync);

			if (opt.verbose) {
				console.log(styleText('underline', sync.local_path + ':'));
				if (delta.synced.length == delta.items.length && !delta.local_only.length) {
					console.log('\t' + styleText('blueBright', 'All files are synced!'));
					continue;
				}
				for (const { _path } of delta.local_only) console.log('\t' + styleText('green', '+ ' + _path));
				for (const { path } of delta.remote_only) console.log('\t' + styleText('red', '- ' + path));
				for (const { path, modifiedAt } of delta.modified) {
					const outdated = modifiedAt.getTime() > statSync(join(sync.local_path, path)).mtime.getTime();
					console.log('\t' + styleText('yellow', '~ ' + path) + (outdated ? ' (outdated)' : ''));
				}
			} else {
				console.log(
					sync.local_path + ':',
					Object.entries(delta)
						.map(([name, items]) => `${styleText('blueBright', items.length.toString())} ${name.replaceAll('_', '-')}`)
						.join(', ')
				);
			}
		}
	});

cli.command('add')
	.description('Add a folder to be synced')
	.argument('<path>', 'local path to the folder to sync')
	.argument('<remote>', 'remote folder path')
	.action(async (localPath: string, remoteName: string) => {
		localPath = resolve(localPath);

		for (const sync of config.sync) {
			if (sync.local_path == localPath || localPath.startsWith(sync.local_path + '/'))
				io.exit('This local path is already being synced.');
			if (sync.remote_path == remoteName || remoteName.startsWith(sync.remote_path + '/'))
				io.exit('This remote path is already being synced.');
		}

		const { userId } = session();

		const local = await stat(localPath).catch(e => io.exit(e.toString()));
		if (!local.isDirectory()) io.exit('Local path is not a directory.');

		/**
		 * @todo Add an endpoint to fetch directories (maybe with the full paths?)
		 */
		const allItems = remoteName.includes('/') ? (await api.getUserStorage(userId)).items : await api.getUserStorageRoot(userId);
		const remote = walkItems(remoteName, allItems);
		if (!remote) io.exit('Could not resolve remote path.');
		if (remote.type != 'inode/directory') io.exit('Remote path is not a directory.');

		config.sync.push({
			name: remote.name,
			item: remote.id,
			local_path: localPath,
			last_synced: new Date(),
			remote_path: remoteName,
			include_dotfiles: false,
			exclude: [],
		});

		await fetchSyncItems(remote.id);
		saveConfig();
	});

cli.command('unsync')
	.alias('remove-sync')
	.alias('rm-sync')
	.description('Stop syncing a folder')
	.argument('<path>', 'local path to the folder to stop syncing')
	.action((localPath: string) => {
		localPath = resolve(localPath);

		const index = config.sync.findIndex(sync => sync.local_path == localPath);
		if (index == -1) io.exit('This local path is not being synced.');

		unlinkSync(join(configDir, 'sync', config.sync[index].item + '.json'));

		config.sync.splice(index, 1);
		saveConfig();
	});

cli.command('sync')
	.description('Sync files')
	.addOption(
		new Option('--delete <mode>', 'Delete local/remote files that were deleted remotely/locally')
			.choices(['local', 'remote', 'none'])
			.default('none')
	)
	.option('-d, --dry-run', 'Show what would be done, but do not make any changes')
	.option('-v, --verbose', 'Show more details')
	.argument('[sync]', 'The name of the Sync to sync')
	.action(async (name: string, opt: SyncOptions) => {
		if (name) {
			const sync = config.sync.find(s => s.name == name);
			if (!sync) io.exit('Can not find a Sync with that name.');
			await doSync(sync, opt);
		} else for (const sync of config.sync) await doSync(sync, opt);
	});
