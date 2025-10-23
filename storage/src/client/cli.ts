import { configDir, session } from '@axium/client/cli/config';
import { formatBytes } from '@axium/core/format';
import * as io from '@axium/core/node/io';
import { Option, program } from 'commander';
import mime from 'mime';
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { styleText } from 'node:util';
import { pick } from 'utilium';
import { deleteItem, downloadItem, getUserStorage, getUserStorageInfo, getUserStorageRoot, updateItem, uploadItem } from './api.js';
import { config, saveConfig } from './config.js';
import { walkItems } from './paths.js';
import { computeDelta, fetchSyncItems, setItems } from './sync.js';

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
		io.output.error('Not implemented yet.');
	});

cli.command('status')
	.option('-v, --verbose', 'Show more details')
	.option('--refresh', 'Force refresh metadata from the server')
	.action(async opt => {
		console.log(styleText('bold', `${config.sync.length} synced folder(s):`));
		for (const sync of config.sync) {
			if (opt.refresh) await fetchSyncItems(sync.itemId, sync.name);
			const delta = computeDelta(sync.itemId, sync.localPath);

			if (opt.verbose) {
				console.log(styleText('underline', sync.localPath + ':'));
				if (delta.synced.length == delta.items.length && !delta.localOnly.length) {
					console.log('\t' + styleText('blueBright', 'All files are synced!'));
					continue;
				}
				for (const { _path } of delta.localOnly) console.log('\t' + styleText('green', '+ ' + _path));
				for (const { path } of delta.remoteOnly) console.log('\t' + styleText('red', '- ' + path));
				for (const { path, modifiedAt } of delta.modified) {
					const outdated = modifiedAt.getTime() > statSync(join(sync.localPath, path)).mtime.getTime();
					console.log('\t' + styleText('yellow', '~ ' + path) + (outdated ? ' (outdated)' : ''));
				}
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
			if (sync.localPath == localPath || localPath.startsWith(sync.localPath + '/'))
				io.exit('This local path is already being synced.');
			if (sync.remotePath == remoteName || remoteName.startsWith(sync.remotePath + '/'))
				io.exit('This remote path is already being synced.');
		}

		const { userId } = session();

		const local = await stat(localPath).catch(e => io.exit(e.toString()));
		if (!local.isDirectory()) io.exit('Local path is not a directory.');

		/**
		 * @todo Add an endpoint to fetch directories (maybe with the full paths?)
		 */
		const allItems = remoteName.includes('/') ? (await getUserStorage(userId)).items : await getUserStorageRoot(userId);
		const remote = walkItems(remoteName, allItems);
		if (!remote) io.exit('Could not resolve remote path.');
		if (remote.type != 'inode/directory') io.exit('Remote path is not a directory.');

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

cli.command('unsync')
	.alias('remove-sync')
	.alias('rm-sync')
	.description('Stop syncing a folder')
	.argument('<path>', 'local path to the folder to stop syncing')
	.action((localPath: string) => {
		localPath = resolve(localPath);

		const index = config.sync.findIndex(sync => sync.localPath == localPath);
		if (index == -1) io.exit('This local path is not being synced.');

		unlinkSync(join(configDir, 'sync', config.sync[index].itemId + '.json'));

		config.sync.splice(index, 1);
		saveConfig();
	});

cli.command('sync')
	.description('Sync files')
	.addOption(
		new Option('--delete', 'Delete local/remote files that were deleted remotely/locally')
			.choices(['local', 'remote', 'none'])
			.default('none')
	)
	.option('-d, --dry-run', 'Show what would be done, but do not make any changes')
	.action(async (opt: { delete: 'local' | 'remote' | 'none'; dryRun: boolean }) => {
		for (const sync of config.sync) {
			await fetchSyncItems(sync.itemId, sync.name);
			const delta = computeDelta(sync.itemId, sync.localPath);

			const { _items } = delta;

			if (opt.delete == 'local') delta.localOnly.reverse(); // so directories come after
			for (const dirent of delta.localOnly) {
				if (opt.delete == 'local') {
					io.start('Deleting ' + dirent._path);
					try {
						if (opt.dryRun) process.stdout.write('(dry run) ');
						else {
							unlinkSync(join(sync.localPath, dirent._path));
							_items.delete(dirent._path);
						}
						io.done();
					} catch (e: any) {
						io.error(e.message);
					}
					continue;
				}

				const uploadOpts = {
					parentId: dirname(dirent._path) == '.' ? sync.itemId : _items.get(dirname(dirent._path))?.id,
					name: dirent.name,
				};
				io.start('Uploading ' + dirent._path);
				try {
					if (opt.dryRun) process.stdout.write('(dry run) ');
					else if (dirent.isDirectory()) {
						const dir = await uploadItem(new Blob([], { type: 'inode/directory' }), uploadOpts);
						_items.set(dirent._path, Object.assign(pick(dir, 'id', 'modifiedAt'), { path: dirent._path, hash: null }));
					} else {
						const type = mime.getType(dirent._path) || 'application/octet-stream';
						const content = readFileSync(join(sync.localPath, dirent._path));
						const file = await uploadItem(new Blob([content], { type }), uploadOpts);
						_items.set(dirent._path, Object.assign(pick(file, 'id', 'modifiedAt', 'hash'), { path: dirent._path }));
					}
					io.done();
				} catch (e: any) {
					io.error(e.message);
				}
			}

			if (opt.delete == 'remote') delta.remoteOnly.reverse();
			for (const item of delta.remoteOnly) {
				if (opt.delete == 'remote') {
					io.start('Deleting ' + item.path);
					try {
						if (opt.dryRun) process.stdout.write('(dry run) ');
						else {
							await deleteItem(item.id);
							_items.delete(item.path);
						}
						io.done();
					} catch (e: any) {
						io.error(e.message);
					}
					continue;
				}

				io.start('Downloading ' + item.path);
				try {
					const fullPath = join(sync.localPath, item.path);
					if (opt.dryRun) process.stdout.write('(dry run) ');
					else if (!item.hash) {
						mkdirSync(fullPath, { recursive: true });
					} else {
						const blob = await downloadItem(item.id);
						const content = await blob.bytes();

						writeFileSync(fullPath, content);
					}
					io.done();
				} catch (e: any) {
					io.error(e.message);
				}
			}

			for (const item of delta.modified) {
				io.start('Updating ' + item.path);

				try {
					const content = readFileSync(join(sync.localPath, item.path));
					const type = mime.getType(item.path) || 'application/octet-stream';

					if (item.modifiedAt.getTime() > statSync(join(sync.localPath, item.path)).mtime.getTime()) {
						if (opt.dryRun) process.stdout.write('(dry run) ');
						else {
							const blob = await downloadItem(item.id);
							const content = await blob.bytes();
							writeFileSync(join(sync.localPath, item.path), content);
						}
						console.log('server.');
					} else {
						if (opt.dryRun) process.stdout.write('(dry run) ');
						else {
							const updated = await updateItem(item.id, new Blob([content], { type }));
							_items.set(item.path, Object.assign(pick(updated, 'id', 'modifiedAt', 'hash'), { path: item.path }));
						}
						console.log('local.');
					}
				} catch (e: any) {
					io.error(e.message);
				}
			}

			if (opt.dryRun) return;

			setItems(sync.itemId, Array.from(_items.values()));
			sync.lastSynced = new Date();
			saveConfig();
		}
	});
