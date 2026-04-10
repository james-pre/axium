import { Command } from 'commander';
import * as io from 'ioium/node';
import { colorItem, formatItems } from '../../node.js';
import * as api from '../api.js';
import { getDirectory, resolveItem, syncCache } from '../local.js';

export const ls = new Command('ls')
	.alias('list')
	.description('List the contents of a folder')
	.argument('[path]', 'remote folder path')
	.option('-l, --long', 'show more details')
	.option('-h, --human-readable', 'show sizes in human readable format', false)
	.action(async function axium_files_ls(this, path = '') {
		const { users } = await syncCache();
		const { long, humanReadable } = this.optsWithGlobals();
		const items = await getDirectory(path);
		if (!long) {
			console.log(items.map(colorItem).join('\t'));
			return;
		}

		console.log('total ' + items.length);
		for (const text of formatItems({ items, users, humanReadable })) console.log(text);
	});

export const mkdir = new Command('mkdir')
	.description('Create a remote folder')
	.argument('<path>', 'remote folder path to create')
	.action(async (path: string) => {
		const pathParts = path.split('/');
		const name = pathParts.pop();
		const parentPath = pathParts.join('/');
		const parent = !parentPath ? null : await resolveItem(parentPath);
		if (parent) {
			if (!parent) io.exit('Could not resolve parent folder.');
			if (parent.type != 'inode/directory') io.exit('Parent path is not a directory.');
		}
		await api.uploadItem(new Blob([], { type: 'inode/directory' }), { parentId: parent?.id, name });
	});

export const remove = new Command('remove')
	.command('rm')
	.description('Remove a file or folder')
	.argument('<path>', 'remote path to remove')
	.action(async (path: string) => {
		const item = await resolveItem(path);
		if (!item) io.exit('Could not resolve path.');
		await api.deleteItem(item.id);
	});
