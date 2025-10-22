import { session } from '@axium/client/cli/config';
import { formatBytes } from '@axium/core/format';
import { exit, output } from '@axium/core/node/io';
import { program } from 'commander';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import { getUserStorage, getUserStorageInfo, getUserStorageRoot } from './api.js';
import { config, saveConfig } from './config.js';
import { walkItems } from './paths.js';
import { computeDelta, fetchSyncItems } from './sync.js';

const cli = program.command('files').helpGroup('Plugins:').description('CLI integration for @axium/storage');

cli.command('usage')
	.description('Show your usage')
	.action(async () => {
		const { limits, usage } = await getUserStorageInfo(session().userId);

		console.log(`Items: ${usage.items} ${limits.user_items ? ' / ' + limits.user_items : ''}`);
		console.log(`Space: ${formatBytes(usage.bytes)} ${limits.user_size ? ' / ' + formatBytes(limits.user_size * 1_000_000) : ''}`);
	});

cli.command('ls')
	.alias('list')
	.description('List the contents of a folder')
	.action(() => {
		output.error('Not implemented yet.');
	});

cli.command('status')
	.option('-v, --verbose', 'Show more details')
	.action(opt => {
		console.log(styleText('bold', `${config.sync.length} synced folder(s):`));
		for (const sync of config.sync) {
			const delta = computeDelta(sync.itemId, sync.localPath);

			if (opt.verbose) {
				console.log(styleText('underline', sync.localPath + ':'));
				if (delta.synced.length == delta.items.length) {
					console.log('\t' + styleText('blueBright', 'All files are synced!'));
					continue;
				}
				for (const path of delta.added) console.log('\t' + styleText('green', '+ ' + path));
				for (const { path } of delta.deleted) console.log('\t' + styleText('red', '- ' + path));
				for (const { path } of delta.modified) console.log('\t' + styleText('yellow', '~ ' + path));
			} else {
				console.log(
					sync.localPath + ':',
					Object.entries(delta)
						.map(([name, items]) => `${styleText('blueBright', items.length.toString())} ${name}`)
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
			if (sync.localPath == localPath || localPath.startsWith(sync.localPath + '/')) exit('This local path is already being synced.');
			if (sync.remotePath == remoteName || remoteName.startsWith(sync.remotePath + '/'))
				exit('This remote path is already being synced.');
		}

		const { userId } = session();

		const local = await stat(localPath).catch(e => exit(e.toString()));
		if (!local.isDirectory()) exit('Local path is not a directory.');

		/**
		 * @todo Add an endpoint to fetch directories (maybe with the full paths?)
		 */
		const allItems = remoteName.includes('/') ? (await getUserStorage(userId)).items : await getUserStorageRoot(userId);
		const remote = walkItems(remoteName, allItems);
		if (!remote) exit('Could not resolve remote path.');
		if (remote.type != 'inode/directory') exit('Remote path is not a directory.');

		config.sync.push({
			name: remote.name,
			itemId: remote.id,
			localPath,
			lastSynced: new Date(),
			remotePath: remoteName,
		});

		await fetchSyncItems(remote.id);
		saveConfig();
	});

cli.command('pull')
	.description('Update locally synced files from the server')
	.action(async () => {
		for (const sync of config.sync) await fetchSyncItems(sync.itemId, sync.name);
	});

cli.command('push')
	.description('Upload locally synced files to the server')
	.action(() => {});
