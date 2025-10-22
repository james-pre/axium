import { formatBytes } from '@axium/core/format';
import { count, database } from '@axium/server/database';
import { program } from 'commander';

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
