import { formatBytes, parseByteSize, type UserInternal } from '@axium/core';
import { io } from '@axium/core/node';
import { lookupUser } from '@axium/server/cli';
import { count, database } from '@axium/server/database';
import { Option, program } from 'commander';
import { styleText } from 'node:util';
import * as z from 'zod';
import { parseItem } from './db.js';

const cli = program.command('files').helpGroup('Plugins:').description('CLI integration for @axium/storage');

cli.command('usage')
	.description('Show storage usage information')
	.action(async () => {
		const { storage: items } = await count('storage');
		const { size } = await database
			.selectFrom('storage')
			.select(eb => eb.fn.sum('size').as('size'))
			.executeTakeFirstOrThrow();

		console.log(`${items} items totaling ${formatBytes(Number(size))}`);
	});

interface QueryOptions {
	name?: string;
	type?: string;
	user?: Promise<UserInternal>;
	minSize?: number;
	maxSize?: number;
	size?: number;
	limit: number;
	json: boolean;
	format: string;
}

const _byteSize = (msg: string) => (v: string) => parseByteSize(v) ?? io.exit(msg);

cli.command('query')
	.alias('q')
	.alias('find')
	.description('Find storage items')
	.option('-n, --name <name>', 'Filter by name')
	.option('-t, --type <type>', 'Filter by MIME type')
	.addOption(new Option('-u, --user <user>', 'Filter by user UUID or email').argParser(lookupUser))
	.option('-m, --min-size <size>', 'Filter by minimum size', _byteSize('Invalid minimum size.'))
	.option('-M, --max-size <size>', 'Filter by maximum size', _byteSize('Invalid maximum size.'))
	.addOption(new Option('--size', 'Filter by exact size').conflicts(['minSize', 'maxSize']).argParser(_byteSize('Invalid size.')))
	.option('-l, --limit <n>', 'Limit the number of results', (v: string) => z.coerce.number().int().min(1).max(1000).parse(v), 100)
	.option('-j, --json', 'Output results as JSON', false)
	.addOption(
		new Option('-f, --format <format>', 'How to format output lines').conflicts('json').default('{id} {type} {size} {userId} {name}')
	)
	.action(async (opt: QueryOptions) => {
		let query = database
			.selectFrom('storage')
			.selectAll()
			.limit(opt.limit + 1);

		if (opt.name) query = query.where('name', 'like', `%${opt.name}%`);
		if (opt.type) {
			const hasWildcard = opt.type.endsWith('/*') || opt.type.startsWith('*/');
			query = query.where('type', hasWildcard ? 'like' : '=', !hasWildcard ? opt.type : opt.type.replace('*', '%'));
		}
		if (opt.user) {
			const user = await opt.user;
			query = query.where('userId', '=', user.id);
		}
		let validMinSize = false;
		if (opt.minSize !== undefined) {
			if (opt.minSize == 0) io.warn('Minimum size of 0 has no effect, ignoring.');
			else {
				query = query.where('size', '>=', opt.minSize);
				validMinSize = true;
			}
		}
		if (opt.maxSize) {
			if (validMinSize && opt.maxSize < opt.minSize!) io.exit('Maximum size cannot be smaller than minimum size.');
			query = query.where('size', '<=', opt.maxSize);
		}
		if (opt.size !== undefined) {
			query = query.where('size', '=', opt.size);
		}

		const rawItems = await query.execute().catch(io.handleError);
		const items = rawItems.map(parseItem);

		if (!items.length) {
			console.log(styleText(['italic', 'dim'], 'No storage items match the provided filters.'));
			process.exit(2);
		}

		if (items.length > opt.limit) {
			items.pop();
			io.warn('Showing first', opt.limit, 'results, others have been omitted.');
		}

		if (opt.json) {
			console.log(JSON.stringify(items, null, 4));
			return;
		}

		let maxTypeLength = 0;
		for (const item of items) {
			maxTypeLength = Math.max(maxTypeLength, item.type.length);
		}

		for (const item of items) {
			const replacements = Object.assign(Object.create(null), {
				id: item.id,
				type: item.type.padStart(maxTypeLength),
				userId: item.userId,
				size: styleText('blueBright', item.type == 'inode/directory' ? '    -    ' : formatBytes(item.size).padStart(9)),
				name: styleText('yellow', JSON.stringify(item.name)),
				modified: new Date(item.modifiedAt).toISOString(),
			});

			const text = opt.format.replaceAll(/(?<!\\)\{(\w+)\}/g, (_, key) => (key in replacements ? replacements[key] : `{${key}}`));
			console.log(text);
		}
	});
