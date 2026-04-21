import { Option, program } from 'commander';
import * as io from 'ioium/node';
import { createWriteStream, type WriteStream } from 'node:fs';
import { styleText, type InspectColor } from 'node:util';
import { _throw, capitalize } from 'utilium';
import * as z from 'zod';
import { sharedOptions as opts, rlConfirm } from './common.js';
import * as db from '../db/index.js';

const axiumDB = program.command('db').alias('database').description('Manage the database').addOption(opts.timeout);

export async function dbInitTables() {
	const info = db.getUpgradeInfo();
	const schema = db.schema.getFull({ exclude: Object.keys(info.current) });
	const delta = db.delta.compute({ tables: {}, indexes: {} }, schema);
	if (db.delta.isEmpty(delta)) return;
	for (const text of db.delta.display(delta)) console.log(text);
	await rlConfirm();
	await using _ = db.connect();
	await db.delta.apply(delta);
	Object.assign(info.current, schema.versions);
	db.setUpgradeInfo(info);
}

axiumDB
	.command('init')
	.description('Initialize the database')
	.addOption(opts.force)
	.option('-s, --skip', 'If the user, database, or schema already exists, skip trying to create it.', false)
	.addOption(opts.check)
	.action(async function axium_db_init() {
		const opt = this.optsWithGlobals();
		await db.init(opt);
		await dbInitTables();
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('Check the status of the database')
	.action(async () => {
		try {
			console.log(await db.statText());
		} catch {
			io.error('Unavailable');
			process.exitCode = 1;
		}
	});

axiumDB
	.command('drop')
	.description('Drop the Axium database and user')
	.addOption(opts.force)
	.action(async opt => {
		const stats = await db.count('users', 'passkeys', 'sessions');

		if (!opt.force)
			for (const key of ['users', 'passkeys', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				io.warn(`Database has existing ${key}. Use --force if you really want to drop the database.`);
				process.exit(2);
			}

		await db._sql('DROP DATABASE axium', 'Dropping database');
		await db._sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges');
		await db._sql('DROP USER axium', 'Dropping user');

		await db
			.getHBA()
			.then(([content, writeBack]) => {
				io.track('Checking for Axium HBA configuration', () => !content.includes(db._pgHba) && _throw('missing.'));
				const newContent = io.track('Removing Axium HBA configuration', () => content.replace(db._pgHba, ''));
				writeBack(newContent);
			})
			.catch(io.warn);
	});

axiumDB
	.command('wipe')
	.description('Wipe the database')
	.addOption(opts.force)
	.action(async opt => {
		const tables = new Map<keyof db.Schema, string>();

		for (const [plugin, schema] of db.schema.getFiles()) {
			for (const table of schema.wipe as (keyof db.Schema)[]) {
				const maybePlugin = tables.get(table);
				tables.set(table, maybePlugin ? `${maybePlugin}, ${plugin}` : plugin);
			}
		}

		if (!opt.force) {
			const stats = await db.count(...tables.keys());
			const nonEmpty = Object.entries(stats)
				.filter(([, v]) => v)
				.map(([k]) => k);
			if (nonEmpty.length) {
				io.exit(`Some tables are not empty, use --force if you really want to wipe them: ${nonEmpty.join(', ')}`, 2);
			}
		}

		const maxTableName = Math.max(5, ...Array.from(tables.keys()).map(t => t.length));

		console.log('Table' + ' '.repeat(maxTableName - 5), '|', 'Plugin(s)');
		console.log('-'.repeat(maxTableName), '|', '-'.repeat(20));
		for (const [table, plugins] of [...tables].sort((a, b) => a[0].localeCompare(b[0]))) {
			console.log(table + ' '.repeat(maxTableName - table.length), '|', plugins);
		}

		await rlConfirm('Are you sure you want to wipe these tables and any dependents');

		await db.database.deleteFrom(Array.from(tables.keys())).execute();
	});

axiumDB
	.command('check')
	.description('Check the structure of the database')
	.option('-s, --strict', 'Throw errors instead of emitting warnings for most column problems')
	.action(async opt => {
		await io.runShell('Checking for sudo', 'which sudo');
		await io.runShell('Checking for psql', 'which psql');

		const throwUnlessRows = (text: string) => {
			if (text.includes('(0 rows)')) throw 'missing.';
			return text;
		};

		await db._sql(`SELECT 1 FROM pg_database WHERE datname = 'axium'`, 'Checking for database').then(throwUnlessRows);

		await db._sql(`SELECT 1 FROM pg_roles WHERE rolname = 'axium'`, 'Checking for user').then(throwUnlessRows);

		await using _ = io.track('Connecting to database', db.connect);

		const schemas = await io.track('Getting schema metadata', db.database.introspection.getSchemas());

		io.start('Checking for acl schema');
		if (!schemas.find(s => s.name == 'acl')) io.exit('missing.');
		io.done();

		const tableMetadata = await io.track(
			'Getting table metadata',
			Promise.all([db.database.introspection.getTables(), db.database.withSchema('acl').introspection.getTables()]).then(md =>
				md.flat()
			)
		);

		const tables = Object.fromEntries(tableMetadata.map(t => [t.schema == 'public' ? t.name : `${t.schema}.${t.name}`, t]));

		const schema = io.track('Resolving database schemas', () => db.schema.getFull());

		for (const [name, table] of Object.entries(schema.tables)) {
			await db.checkTableTypes(name as keyof db.Schema, table, opt, tableMetadata);
			delete tables[name];
		}

		io.start('Checking for extra tables');
		const unchecked = Object.keys(tables).join(', ');
		if (!unchecked.length) io.done();
		else if (opt.strict) io.exit(unchecked);
		else {
			io.done(true);
			io.warn(unchecked);
		}
	});

axiumDB
	.command('clean')
	.description('Remove expired rows')
	.addOption(opts.force)
	.action(async opt => {
		await db.clean(opt);
	});

axiumDB
	.command('rotate-password')
	.description('Generate a new password for the database user and update the config')
	.action(db.rotatePassword);

axiumDB
	.command('json-schema')
	.description('Get the JSON schema for the database configuration file')
	.option('-j, --json', 'values are JSON encoded')
	.action(opt => {
		const schema = z.toJSONSchema(db.schema.SchemaFile, { io: 'input' });
		console.log(opt.json ? JSON.stringify(schema, null, 4) : schema);
	});

axiumDB
	.command('upgrade')
	.alias('update')
	.alias('up')
	.description('Upgrade the database to the latest version')
	.option('--dry-run', 'Rollback changes instead of committing them')
	.action(async function axium_db_upgrade(opt) {
		const deltas: db.delta.Version[] = [];

		const info = db.getUpgradeInfo();

		let empty = true;

		const from: Record<string, number> = {},
			to: Record<string, number> = {};

		for (const [name, schema] of db.schema.getFiles()) {
			if (!(name in info.current)) io.exit('Plugin is not initialized: ' + name);

			const currentVersion = info.current[name];
			const target = schema.latest ?? schema.versions.length - 1;

			if (currentVersion >= target) continue;

			from[name] = currentVersion;
			to[name] = target;

			info.current[name] = target;

			let versions = schema.versions.slice(currentVersion + 1);

			const v0 = schema.versions[0];
			if (v0.delta) throw 'Initial version can not be a delta';

			for (const [i, v] of versions.toReversed().entries()) {
				if (v.delta || v == v0) continue;
				versions = [db.delta.compute(v0, v), ...versions.slice(-i)];
				break;
			}

			const delta = db.delta.collapse(versions as db.delta.Version[]);

			deltas.push(delta);

			console.log(
				'Upgrading',
				name,
				styleText('dim', currentVersion.toString() + '->') + styleText('blueBright', target.toString()) + ':'
			);
			if (!db.delta.isEmpty(delta)) empty = false;
			for (const text of db.delta.display(delta)) console.log(text);
		}

		if (empty) {
			console.log('Already up to date.');
			return;
		}

		await rlConfirm();

		const delta = io.track('Computing delta', () => db.delta.collapse(deltas));

		io.track('Validating delta', () => db.delta.validate(delta));

		console.log('Applying delta.');
		await db.delta.apply(delta, opt.dryRun);

		if (opt.dryRun) {
			io.warn('--dry-run: No changes were applied.');
		} else {
			info.upgrades.push({ timestamp: new Date(), from, to });
			db.setUpgradeInfo(info);
		}
	});

axiumDB
	.command('upgrade-history')
	.alias('update-history')
	.description('Show the history of database upgrades')
	.action(() => {
		const info = db.getUpgradeInfo();

		if (!info.upgrades.length) {
			console.log('No upgrade history.');
			return;
		}

		for (const up of info.upgrades) {
			console.log(styleText(['whiteBright', 'underline'], up.timestamp.toString()) + ':');

			for (const [name, from] of Object.entries(up.from)) {
				console.log(name, styleText('dim', from.toString() + '->') + styleText('blueBright', up.to[name].toString()));
			}
		}
	});

interface DBVersionInfo {
	name: string;
	current: number;
	latest: number;
	available: number;
}

function colorCurrent(info: DBVersionInfo): InspectColor {
	if (info.current > Math.max(info.latest, info.available)) return 'magentaBright';
	if (info.current > info.latest && info.current <= info.available) return 'cyanBright';
	if (info.current >= info.latest) return 'greenBright';
	return 'yellowBright';
}

axiumDB
	.command('versions')
	.description('Show information about database versions')
	.action(() => {
		const { current: currentVersions } = db.getUpgradeInfo();

		const lengths = { name: 4, current: 7, latest: 6, available: 9 };
		const entries: DBVersionInfo[] = [];

		for (const [name, file] of db.schema.getFiles()) {
			const available = file.versions.length - 1;
			const latest = file.latest ?? available;
			const current = currentVersions[name];
			entries.push({ name, latest, available, current });
			lengths.name = Math.max(lengths.name || 0, name.length);
			lengths.current = Math.max(lengths.current || 0, current.toString().length);
			lengths.latest = Math.max(lengths.latest || 0, latest.toString().length);
			lengths.available = Math.max(lengths.available || 0, available.toString().length);
		}

		console.log(
			...(['name', 'current', 'latest', 'available'] as const).map(key =>
				styleText(['whiteBright', 'underline'], capitalize(key).padStart(lengths[key]))
			)
		);

		for (const entry of entries) {
			console.log(
				entry.name.padStart(lengths.name),
				styleText(colorCurrent(entry), entry.current.toString().padStart(lengths.current)),
				entry.latest.toString().padStart(lengths.latest),
				entry.available.toString().padStart(lengths.available)
			);
		}
	});

axiumDB
	.command('export-schema')
	.description('Export the DB schema')
	.addOption(new Option('-f, --format <format>', 'Output format').choices(['sql', 'graph']).default('sql'))
	.option('-o, --output <file>', 'Output file path')
	.action(opt => {
		const schema = db.schema.getFull();

		const it = opt.format == 'sql' ? db.schema.toSQL(schema) : db.schema.toGraph(schema);
		const out = opt.output ? createWriteStream(opt.output) : process.stdout;

		for (const data of it) out.write(data);

		if (opt.output) (out as WriteStream).close();
	});
