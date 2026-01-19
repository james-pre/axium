#!/usr/bin/env node
import type { AuditEvent, UserInternal } from '@axium/core';
import { apps } from '@axium/core';
import { AuditFilter, severityNames } from '@axium/core/audit';
import { formatDateRange } from '@axium/core/format';
import { io, outputDaemonStatus, pluginText } from '@axium/core/node';
import { _findPlugin, plugins, runIntegrations } from '@axium/core/plugins';
import { Argument, Option, program } from 'commander';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path/posix';
import { createInterface } from 'node:readline/promises';
import { parseArgs, styleText } from 'node:util';
import { getByString, isJSON, setByString, type Entries } from 'utilium';
import * as z from 'zod';
import $pkg from '../package.json' with { type: 'json' };
import { audit, getEvents, styleSeverity } from './audit.js';
import { diffUpdate, lookupUser, userText } from './cli.js';
import config, { configFiles, FileSchema, saveConfigTo } from './config.js';
import * as db from './database.js';
import { _portActions, _portMethods, restrictedPorts, type PortOptions } from './io.js';
import { linkRoutes, listRouteLinks, unlinkRoutes } from './linking.js';
import { serve } from './serve.js';

using rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function rlConfirm(question: string = 'Is this ok'): Promise<void> {
	const { data, error } = z
		.stringbool()
		.default(false)
		.safeParse(await rl.question(question + ' [y/N]: ').catch(() => io.exit('Aborted.')));
	if (error || !data) io.exit('Aborted.');
}

// Need these before Command is set up (e.g. for CLI integrations)
const { safe, config: configFromCLI } = parseArgs({
	options: {
		safe: { type: 'boolean', default: z.stringbool().default(false).parse(process.env.SAFE?.toLowerCase()) },
		config: { type: 'string', short: 'c' },
	},
	allowPositionals: true,
	strict: false,
}).values as { safe: boolean; config?: string };

await config.loadDefaults(safe);

if (configFromCLI) await config.load(configFromCLI, { safe });

await runIntegrations();

program
	.version($pkg.version)
	.name('axium')
	.description('Axium server CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('--safe', 'do not execute code from plugins', false)
	.option('--debug', 'override debug mode')
	.option('--no-debug', 'override debug mode')
	.option('-c, --config <path>', 'path to the config file')
	.hook('preAction', (_, action) => {
		const opt = action.optsWithGlobals();
		opt.force && io.warn('--force: Protections disabled.');
		if (typeof opt.debug == 'boolean') {
			config.set({ debug: opt.debug });
			io._setDebugOutput(opt.debug);
		}
		try {
			db.connect();
		} catch (e) {
			if (!noAutoDB.includes(action.name())) throw e;
		}
	})
	.hook('postAction', async (_, action) => {
		if (!noAutoDB.includes(action.name())) await db.database.destroy();
	})
	.on('option:debug', () => config.set({ debug: true }));

const noAutoDB = ['init', 'serve', 'check'];

// Options shared by multiple (sub)commands
const opts = {
	check: new Option('--check', 'check the database schema after initialization').default(false),
	force: new Option('-f, --force', 'force the operation').default(false),
	global: new Option('-g, --global', 'apply the operation globally').default(false),
	timeout: new Option('-t, --timeout <ms>', 'how long to wait for commands to complete.').default(1000).argParser(value => {
		const timeout = parseInt(value);
		if (!Number.isSafeInteger(timeout) || timeout < 0) io.warn('Invalid timeout value, using default.');
		io.setCommandTimeout(timeout);
	}),
	packagesDir: new Option('-p, --packages-dir <dir>', 'the directory to look for packages in'),
};

interface OptCommon {
	debug: boolean;
	config: string;
	force?: boolean;
}

const axiumDB = program.command('db').alias('database').description('Manage the database').addOption(opts.timeout);

async function dbInitTables() {
	const info = db.getUpgradeInfo();
	const schema = db.getFullSchema({ exclude: Object.keys(info.current) });
	const delta = db.computeDelta({ tables: {}, indexes: [] }, schema);
	if (db.deltaIsEmpty(delta)) return;
	for (const text of db.displayDelta(delta)) console.log(text);
	await rlConfirm();
	await db.applyDelta(delta);
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
		await db.init(opt).catch(io.exit);
		await dbInitTables().catch(io.exit);
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
		const stats = await db.count('users', 'passkeys', 'sessions').catch(io.exit);

		if (!opt.force)
			for (const key of ['users', 'passkeys', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				io.warn(`Database has existing ${key}. Use --force if you really want to drop the database.`);
				process.exit(2);
			}

		await db._sql('DROP DATABASE axium', 'Dropping database').catch(io.exit);
		await db._sql('REVOKE ALL PRIVILEGES ON SCHEMA public FROM axium', 'Revoking schema privileges').catch(io.exit);
		await db._sql('DROP USER axium', 'Dropping user').catch(io.exit);

		await db
			.getHBA(opt)
			.then(([content, writeBack]) => {
				io.start('Checking for Axium HBA configuration');
				if (!content.includes(db._pgHba)) throw 'missing.';
				io.done();

				io.start('Removing Axium HBA configuration');
				const newContent = content.replace(db._pgHba, '');
				io.done();

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

		for (const [plugin, schema] of db.getSchemaFiles()) {
			for (const table of schema.wipe as (keyof db.Schema)[]) {
				const maybePlugin = tables.get(table);
				tables.set(table, maybePlugin ? `${maybePlugin}, ${plugin}` : plugin);
			}
		}

		if (!opt.force) {
			const stats = await db.count(...tables.keys()).catch(io.exit);
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

		await db.database.deleteFrom(Array.from(tables.keys())).execute().catch(io.exit);
	});

axiumDB
	.command('check')
	.description('Check the structure of the database')
	.option('-s, --strict', 'Throw errors instead of emitting warnings for most column problems')
	.action(async opt => {
		await io.run('Checking for sudo', 'which sudo').catch(io.exit);
		await io.run('Checking for psql', 'which psql').catch(io.exit);

		const throwUnlessRows = (text: string) => {
			if (text.includes('(0 rows)')) throw 'missing.';
			return text;
		};

		await db._sql(`SELECT 1 FROM pg_database WHERE datname = 'axium'`, 'Checking for database').then(throwUnlessRows).catch(io.exit);

		await db._sql(`SELECT 1 FROM pg_roles WHERE rolname = 'axium'`, 'Checking for user').then(throwUnlessRows).catch(io.exit);

		io.start('Connecting to database');
		await using _ = db.connect();
		io.done();

		io.start('Getting schema metadata');
		const schemas = await db.database.introspection.getSchemas().catch(io.exit);
		io.done();

		io.start('Checking for acl schema');
		if (!schemas.find(s => s.name == 'acl')) io.exit('missing.');
		io.done();

		io.start('Getting table metadata');
		const tablePromises = await Promise.all([
			db.database.introspection.getTables(),
			db.database.withSchema('acl').introspection.getTables(),
		]).catch(io.exit);
		const tableMetadata = tablePromises.flat();
		const tables = Object.fromEntries(tableMetadata.map(t => [t.schema == 'public' ? t.name : `${t.schema}.${t.name}`, t]));
		io.done();

		io.start('Resolving database schemas');
		let schema;
		try {
			schema = db.getFullSchema();
			io.done();
		} catch (e: any) {
			io.exit(e);
		}

		for (const [name, table] of Object.entries(schema.tables)) {
			await db.checkTableTypes(name as keyof db.Schema, table, opt, tableMetadata);
			delete tables[name];
		}

		io.start('Checking for extra tables');
		const unchecked = Object.keys(tables).join(', ');
		if (!unchecked.length) io.done();
		else if (opt.strict) io.exit(unchecked);
		else io.warn(unchecked);
	});

axiumDB
	.command('clean')
	.description('Remove expired rows')
	.addOption(opts.force)
	.action(async opt => {
		await db.clean(opt).catch(io.exit);
	});

axiumDB
	.command('rotate-password')
	.description('Generate a new password for the database user and update the config')
	.action(db.rotatePassword);

axiumDB
	.command('schema')
	.description('Get the JSON schema for the database configuration file')
	.option('-j, --json', 'values are JSON encoded')
	.action(opt => {
		try {
			const schema = z.toJSONSchema(db.SchemaFile, { io: 'input' });
			console.log(opt.json ? JSON.stringify(schema, null, 4) : schema);
		} catch (e: any) {
			io.exit(e);
		}
	});

axiumDB
	.command('upgrade')
	.alias('update')
	.alias('up')
	.description('Upgrade the database to the latest version')
	.option('--abort', 'Rollback changes instead of committing them')
	.action(async function axium_db_upgrade(opt) {
		const deltas: db.VersionDelta[] = [];

		const info = db.getUpgradeInfo();

		let empty = true;

		const from: Record<string, number> = {},
			to: Record<string, number> = {};

		for (const [name, schema] of db.getSchemaFiles()) {
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
				versions = [db.computeDelta(v0, v), ...versions.slice(-i)];
				break;
			}

			const delta = db.collapseDeltas(versions as db.VersionDelta[]);

			deltas.push(delta);

			console.log(
				'Upgrading',
				name,
				styleText('dim', currentVersion.toString() + '->') + styleText('blueBright', target.toString()) + ':'
			);
			if (!db.deltaIsEmpty(delta)) empty = false;
			for (const text of db.displayDelta(delta)) console.log(text);
		}

		if (empty) {
			console.log('Already up to date.');
			return;
		}

		if (opt.abort) {
			io.warn('--abort: Changes will be rolled back instead of being committed.');
		}

		await rlConfirm();

		io.start('Computing delta');
		let delta: db.VersionDelta;
		try {
			delta = db.collapseDeltas(deltas);
			io.done();
		} catch (e: any) {
			io.exit(e);
		}

		io.start('Validating delta');
		try {
			db.validateDelta(delta);
			io.done();
		} catch (e: any) {
			io.exit(e);
		}

		console.log('Applying delta.');
		await db.applyDelta(delta, opt.abort).catch(io.exit);

		info.upgrades.push({ timestamp: new Date(), from, to });
		db.setUpgradeInfo(info);
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

axiumDB
	.command('versions')
	.description('Show information about database versions')
	.action(() => {
		const { current: currentVersions } = db.getUpgradeInfo();

		const lengths = { name: 4, current: 7, latest: 6, available: 9 };
		const entries: { name: string; current: string; latest: string; available: string }[] = [
			{ name: 'Name', current: 'Current', latest: 'Latest', available: 'Available' },
		];

		for (const [name, file] of db.getSchemaFiles()) {
			const available = (file.versions.length - 1).toString();
			const latest = (file.latest ?? available).toString();
			const current = currentVersions[name]?.toString();
			entries.push({ name, latest, available, current });
			lengths.name = Math.max(lengths.name || 0, name.length);
			lengths.current = Math.max(lengths.current || 0, current.length);
			lengths.latest = Math.max(lengths.latest || 0, latest.length);
			lengths.available = Math.max(lengths.available || 0, available.length);
		}

		for (const [i, entry] of entries.entries()) {
			console.log(
				...(['name', 'current', 'latest', 'available'] as const).map(key =>
					styleText(
						i === 0 ? ['whiteBright', 'underline'] : entry[key] === undefined ? 'reset' : [],
						entry[key].padStart(lengths[key])
					)
				)
			);
		}
	});

const axiumConfig = program
	.command('config')
	.description('Manage the configuration')
	.addOption(opts.global)
	.option('-j, --json', 'values are JSON encoded', false)
	.option('-r, --redact', 'Do not output sensitive values', false);

function configReplacer(opt: { redact: boolean }) {
	return (key: string, value: any) => {
		return opt.redact && ['password', 'secret'].includes(key) ? '[redacted]' : value;
	};
}

axiumConfig
	.command('dump')
	.description('Output the entire current configuration')
	.action(function axium_config_dump() {
		const opt = this.optsWithGlobals();
		const value = config.plain();
		console.log(opt.json ? JSON.stringify(value, configReplacer(opt), 4) : value);
	});

axiumConfig
	.command('get')
	.description('Get a config value')
	.argument('<key>', 'the key to get')
	.action(function axium_config_get(key) {
		const opt = this.optsWithGlobals();
		const value = getByString(config.plain(), key);
		console.log(opt.json ? JSON.stringify(value, configReplacer(opt), 4) : value);
	});

axiumConfig
	.command('set')
	.description('Set a config value. Note setting objects is not supported.')
	.argument('<key>', 'the key to set')
	.argument('<value>', 'the value')
	.action(function axium_config_set(key, value) {
		const opt = this.optsWithGlobals();
		if (opt.json && !isJSON(value)) io.exit('Invalid JSON');
		const obj: Record<string, any> = {};
		setByString(obj, key, opt.json ? JSON.parse(value) : value);
		config.save(obj, opt.global);
	});

axiumConfig
	.command('list')
	.alias('ls')
	.alias('files')
	.description('List loaded config files')
	.action(() => {
		for (const path of config.files.keys()) console.log(path);
	});

axiumConfig
	.command('schema')
	.description('Get the JSON schema for the configuration file')
	.action(() => {
		const opt = axiumConfig.optsWithGlobals();
		try {
			const schema = z.toJSONSchema(FileSchema, { io: 'input' });
			console.log(opt.json ? JSON.stringify(schema, configReplacer(opt), 4) : schema);
		} catch (e: any) {
			io.exit(e);
		}
	});

const axiumPlugin = program.command('plugin').alias('plugins').description('Manage plugins').addOption(opts.global);

axiumPlugin
	.command('list')
	.alias('ls')
	.description('List loaded plugins')
	.option('-l, --long', 'use the long listing format')
	.option('--no-versions', 'do not show plugin versions')
	.action(opt => {
		if (!plugins.size) {
			console.log('No plugins loaded.');
			return;
		}

		if (!opt.long) {
			console.log(Array.from(plugins.keys()).join(', '));
			return;
		}

		console.log(styleText('whiteBright', plugins.size + ' plugin(s) loaded:'));

		for (const plugin of plugins.values()) {
			console.log(plugin.name, opt.versions ? plugin.version : '');
		}
	});

axiumPlugin
	.command('info')
	.description('Get information about a plugin')
	.argument('<plugin>', 'the plugin to get information about')
	.action((search: string) => {
		const plugin = _findPlugin(search);
		for (const line of pluginText(plugin)) console.log(line);
	});

axiumPlugin
	.command('remove')
	.alias('rm')
	.description('Remove a plugin')
	.argument('<plugin>', 'the plugin to remove')
	.action(async (search, opt) => {
		const plugin = _findPlugin(search);

		await plugin._hooks?.remove?.(opt);

		for (const [path, data] of configFiles) {
			if (!data.plugins) continue;

			data.plugins = data.plugins.filter(p => p !== plugin.specifier);
			saveConfigTo(path, data);
		}

		plugins.delete(plugin.name);
	});

axiumPlugin
	.command('init')
	.alias('setup')
	.alias('install')
	.description('Initialize a plugin. This could include adding tables to the database or linking routes.')
	.addOption(opts.timeout)
	.addOption(opts.check)
	.argument('<plugin>', 'the plugin to initialize')
	.action(async search => {
		const plugin = _findPlugin(search);
		if (!plugin) io.exit(`Can't find a plugin matching "${search}"`);

		await using _ = db.connect();
	});

const axiumApps = program.command('apps').description('Manage Axium apps').addOption(opts.global);

axiumApps
	.command('list')
	.alias('ls')
	.description('List apps added by plugins')
	.option('-l, --long', 'use the long listing format')
	.option('-b, --builtin', 'include built-in apps')
	.action(opt => {
		if (!apps.size) {
			console.log('No apps.');
			return;
		}

		if (!opt.long) {
			console.log(Array.from(apps.values().map(app => app.name)).join(', '));
			return;
		}

		console.log(styleText('whiteBright', apps.size + ' app(s) loaded:'));
		for (const app of apps.values()) {
			console.log(app.name, styleText('dim', `(${app.id})`));
		}
	});

const argUserLookup = new Argument('<user>', 'the UUID or email of the user to operate on').argParser(lookupUser);

program
	.command('user')
	.description('Get or change information about a user')
	.addArgument(argUserLookup)
	.option('-S, --sessions', 'show user sessions')
	.option('-P, --passkeys', 'show user passkeys')
	.option('--add-role <role...>', 'add roles to the user')
	.option('--remove-role <role...>', 'remove roles from the user')
	.option('--tag <tag...>', 'Add tags to the user')
	.option('--untag <tag...>', 'Remove tags from the user')
	.option('--delete', 'Delete the user')
	.option('--suspend', 'Suspend the user')
	.addOption(new Option('--unsuspend', 'Un-suspend the user').conflicts('suspend'))
	.action(async (_user: Promise<UserInternal>, opt) => {
		let user = await _user;

		const [updatedRoles, roles, rolesDiff] = diffUpdate(user.roles, opt.addRole, opt.removeRole);
		const [updatedTags, tags, tagsDiff] = diffUpdate(user.tags, opt.tag, opt.untag);
		const changeSuspend = (opt.suspend || opt.unsuspend) && user.isSuspended != (opt.suspend ?? !opt.unsuspend);

		if (updatedRoles || updatedTags || changeSuspend) {
			user = await db.database
				.updateTable('users')
				.set({ roles, tags, isSuspended: !changeSuspend ? user.isSuspended : (opt.suspend ?? !opt.unsuspend) })
				.returningAll()
				.executeTakeFirstOrThrow()
				.then(u => {
					if (updatedRoles && rolesDiff) console.log(`> Updated roles: ${rolesDiff}`);
					if (updatedTags && tagsDiff) console.log(`> Updated tags: ${tagsDiff}`);
					if (changeSuspend) console.log(opt.suspend ? '> Suspended' : '> Un-suspended');
					return u;
				})
				.catch(e => io.exit('Failed to update user: ' + e.message));
		}

		if (opt.delete) {
			const confirmed = await rl
				.question(`Are you sure you want to delete ${userText(user, true)}? (y/N) `)
				.then(v => z.stringbool().parseAsync(v))
				.catch(() => false);

			if (!confirmed) console.log(styleText('dim', '> Delete aborted.'));
			else
				await db.database
					.deleteFrom('users')
					.where('id', '=', user.id)
					.executeTakeFirstOrThrow()
					.then(() => console.log(styleText(['red', 'bold'], '> Deleted')))
					.catch(e => io.exit('Failed to delete user: ' + e.message));
		}

		console.log(
			[
				user.isSuspended && styleText('yellowBright', 'Suspended'),
				user.isAdmin && styleText('redBright', 'Administrator'),
				'UUID: ' + user.id,
				'Name: ' + user.name,
				`Email: ${user.email}, ${user.emailVerified ? 'verified on ' + formatDateRange(user.emailVerified) : styleText(config.auth.email_verification ? 'yellow' : 'dim', 'not verified')}`,
				'Registered ' + formatDateRange(user.registeredAt),
				`Roles: ${user.roles.length ? user.roles.join(', ') : styleText('dim', '(none)')}`,
				`Tags: ${user.tags.length ? user.tags.join(', ') : styleText('dim', '(none)')}`,
			]
				.filter(v => v)
				.join('\n')
		);

		if (opt.sessions) {
			const sessions = await db.database.selectFrom('sessions').where('userId', '=', user.id).selectAll().execute();

			console.log(styleText('bold', 'Sessions:'));
			if (!sessions.length) console.log(styleText('dim', '(none)'));
			else
				for (const session of sessions) {
					console.log(
						`\t${session.id}\tcreated ${formatDateRange(session.created).padEnd(40)}\texpires ${formatDateRange(session.expires).padEnd(40)}\t${session.elevated ? styleText('yellow', '(elevated)') : ''}`
					);
				}
		}

		if (opt.passkeys) {
			const passkeys = await db.database.selectFrom('passkeys').where('userId', '=', user.id).selectAll().execute();

			console.log(styleText('bold', 'Passkeys:'));
			for (const passkey of passkeys) {
				console.log(
					`\t${passkey.id}: created ${formatDateRange(passkey.createdAt).padEnd(40)} used ${passkey.counter} times. ${passkey.deviceType}, ${passkey.backedUp ? '' : 'not '}backed up; transports are [${passkey.transports.join(', ')}], ${passkey.name ? 'named ' + JSON.stringify(passkey.name) : 'unnamed'}.`
				);
			}
		}
	});

program
	.command('toggle-admin')
	.description('Toggle whether a user is an administrator')
	.addArgument(argUserLookup)
	.action(async (_user: Promise<UserInternal>) => {
		const user = await _user;

		const isAdmin = !user.isAdmin;
		await db.database.updateTable('users').set({ isAdmin }).where('id', '=', user.id).executeTakeFirstOrThrow();

		await audit('admin_change', undefined, { user: user.id });

		console.log(
			`${userText(user)} is ${isAdmin ? 'now' : 'no longer'} an administrator. (${styleText(['whiteBright', 'bold'], isAdmin.toString())})`
		);
	});

program
	.command('status')
	.alias('stats')
	.description('Get information about the server')
	.action(async () => {
		console.log('Axium Server v' + $pkg.version);

		console.log(styleText('whiteBright', 'Debug mode:'), config.debug ? styleText('yellow', 'enabled') : 'disabled');

		const configFiles = config.files.keys().toArray();
		console.log(
			styleText('whiteBright', 'Loaded config files:'),
			styleText(['dim', 'bold'], `(${configFiles.length})`),
			configFiles.join(', ')
		);

		outputDaemonStatus('axium');

		process.stdout.write(styleText('whiteBright', 'Database: '));

		try {
			console.log(await db.statText());
		} catch {
			console.log(styleText('red', 'Unavailable'));
		}

		console.log(
			styleText('whiteBright', 'Loaded plugins:'),
			styleText(['dim', 'bold'], `(${plugins.size || 'none'})`),
			Array.from(plugins.keys()).join(', ')
		);

		for (const plugin of plugins.values()) {
			if (!plugin._hooks?.statusText) continue;
			const text = await plugin._hooks?.statusText();
			console.log(styleText('bold', plugin.name), plugin.version + ':', text.includes('\n') ? '\n' + text : text);
		}
	});

program
	.command('ports')
	.description('Enable or disable use of restricted ports (e.g. 443)')
	.addArgument(new Argument('<action>', 'The action to take').choices(_portActions))
	.addOption(new Option('-m, --method <method>', 'the method to use').choices(_portMethods).default('node-cap'))
	.option('-N, --node <path>', 'the path to the node binary')
	.action(async (action: PortOptions['action'], opt) => {
		await restrictedPorts({ ...opt, action }).catch(io.exit);
	});

program
	.command('init')
	.description('Install Axium server')
	.addOption(opts.force)
	.addOption(opts.check)
	.addOption(opts.packagesDir)
	.option('-s, --skip', 'Skip already initialized steps', false)
	.action(async opt => {
		await db.init(opt).catch(io.exit);
		await dbInitTables().catch(io.exit);
		await restrictedPorts({ method: 'node-cap', action: 'enable' }).catch(io.exit);
	});

program
	.command('serve')
	.description('Start the Axium server')
	.option('-p, --port <port>', 'the port to listen on', Number.parseInt, config.web.port)
	.option('--ssl <prefix>', 'the prefix for the cert.pem and key.pem SSL files')
	.option('-b, --build <path>', 'the path to the handler build')
	.action(async opt => {
		if (opt.port < 1 || opt.port > 65535) io.exit('Invalid port');

		const server = await serve({
			secure: opt.ssl ? true : config.web.secure,
			ssl_cert: opt.ssl ? join(opt.ssl, 'cert.pem') : config.web.ssl_cert,
			ssl_key: opt.ssl ? join(opt.ssl, 'key.pem') : config.web.ssl_key,
			build: opt.build ? resolve(opt.build) : config.web.build,
		});

		server.listen(opt.port, () => {
			console.log('Server is listening on port ' + opt.port);
		});
	});

program
	.command('link')
	.description('Link routes provided by plugins and the server')
	.addOption(opts.packagesDir)
	.addOption(new Option('-l, --list', 'list route links').conflicts('delete'))
	.option('-d, --delete', 'delete route links')
	.argument('[name...]', 'List of plugin names to operate on. If not specified, operates on all plugins and built-in routes.')
	.action(async function axium_link(names: string[]) {
		const opt = this.optsWithGlobals();

		const linkOpts = { only: names };

		if (opt.list) {
			for (const link of listRouteLinks(linkOpts)) {
				const idText = link.id.startsWith('#') ? `(${link.id.slice(1)})` : link.id;
				const fromColor = await access(link.from)
					.then(() => 'cyanBright' as const)
					.catch(() => 'redBright' as const);
				console.log(
					`${idText}:\t ${styleText(fromColor, link.from)}\t->\t${link.to.replace(/.*\/node_modules\//, styleText('dim', '$&'))}`
				);
			}
			return;
		}

		if (opt.delete) {
			unlinkRoutes(linkOpts);
			return;
		}

		linkRoutes(linkOpts);
	});

program
	.command('audit')
	.description('View audit logs')
	.option('-x, --extra', 'Include the extra object when listing events')
	.option('-t, --include-tags', 'Include tags when listing events')
	.addOption(
		new Option('-s, --summary', 'Summarize audit log entries instead of displaying individual ones').conflicts(['extra', 'includeTags'])
	)
	.optionsGroup('Filters:')
	.option('--since <date>', 'Filter for events since a date')
	.option('--until <date>', 'Filter for events until a date')
	.option('--user <uuid|null>', 'Filter for events triggered by a user')
	.addOption(new Option('--severity <level>', 'Filter for events at or above a severity level').choices(severityNames))
	.option('--source <source>', 'Filter by source')
	.option('--tag <tag...>', 'Filter by tag(s)')
	.option('--event <event>', 'Filter by event name')
	.action(async opt => {
		const filter = await AuditFilter.parseAsync(opt).catch(e => io.exit('Invalid filter: ' + z.prettifyError(e)));

		const events: (AuditEvent & { _extra?: string; _tags?: string })[] = await getEvents(filter).execute();

		if (opt.summary) {
			const groups = Object.groupBy(events, e => e.severity);

			const maxGroupLength = Math.max(...Object.values(groups).map(g => g.length.toString().length), 0);

			for (const [severity, group] of Object.entries(groups) as any as Entries<typeof groups>) {
				if (!group?.length) continue;

				console.log(
					styleText('white', group.length.toString().padStart(maxGroupLength)),
					styleSeverity(severity, true),
					'events. Latest occurred',
					group.at(-1)!.timestamp.toLocaleString()
				);
			}

			return;
		}

		let maxSource = 0,
			maxName = 0,
			maxTags = 0,
			maxExtra = 0;
		for (const event of events) {
			maxSource = Math.max(maxSource, event.source.length);
			maxName = Math.max(maxName, event.name.length);
			event._tags = !event.tags.length
				? ''
				: opt.includeTags
					? '# ' + event.tags.join(', ')
					: `(${event.tags.length} tag${event.tags.length == 1 ? '' : 's'})`;
			maxTags = Math.max(maxTags, event._tags.length);
			const extraKeys = Object.keys(event.extra);
			event._extra = !extraKeys.length ? '' : opt.extra ? JSON.stringify(event.extra) : '+' + extraKeys.length;
			maxExtra = Math.max(maxExtra, event._extra.length);
		}

		for (const event of events) {
			console.log(
				styleSeverity(event.severity, true),
				styleText('dim', io.prettyDate(event.timestamp)),
				event.source.padEnd(maxSource),
				styleText('whiteBright', event.name.padEnd(maxName)),
				styleText('gray', event._tags!.padEnd(maxTags)),
				'by',
				event.userId ? event.userId : styleText(['dim', 'italic'], 'unknown'.padEnd(36)),
				styleText('blue', event._extra!)
			);
		}
	});

await program.parseAsync();
