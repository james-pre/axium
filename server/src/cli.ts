#!/usr/bin/env node
import type { UserInternal, AuditEvent, AuditFilter } from '@axium/core';
import { Severity } from '@axium/core/audit';
import { formatDateRange } from '@axium/core/format';
import { Argument, Option, program, type Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path/posix';
import { createInterface } from 'node:readline/promises';
import { styleText } from 'node:util';
import { capitalize, getByString, isJSON, setByString, uncapitalize, type Entries } from 'utilium';
import * as z from 'zod';
import $pkg from '../package.json' with { type: 'json' };
import { apps } from './apps.js';
import { audit, getEvents, styleSeverity } from './audit.js';
import config, { configFiles, FileSchema, saveConfigTo } from './config.js';
import * as db from './database.js';
import * as io from './io.js';
import { linkRoutes, listRouteLinks, unlinkRoutes, type LinkOptions } from './linking.js';
import { plugins, pluginText, type PluginInternal } from './plugins.js';
import { serve } from './serve.js';

function readline() {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return Object.assign(rl, {
		[Symbol.dispose]: rl.close.bind(rl),
	});
}

function userText(user: UserInternal, bold: boolean = false): string {
	const text = `${user.name} <${user.email}> (${user.id})`;
	return bold ? styleText('bold', text) : text;
}

let safe = false;

program
	.version($pkg.version)
	.name('axium')
	.description('Axium server CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('--safe', 'do not execute code from plugins')
	.option('--debug', 'override debug mode')
	.option('--no-debug', 'override debug mode')
	.option('-c, --config <path>', 'path to the config file');

program.on('option:safe', () => (safe = true));
program.on('option:debug', () => config.set({ debug: true }));
program.on('option:config', () => void config.load(program.opts<OptCommon>().config, { safe }));

const noAutoDB = ['init', 'serve', 'check'];

program.hook('preAction', async function (_, action: Command) {
	await config.loadDefaults(safe);
	const opt = action.optsWithGlobals<OptCommon>();
	opt.force && io.output.warn('--force: Protections disabled.');
	if (typeof opt.debug == 'boolean') {
		config.set({ debug: opt.debug });
		io._setDebugOutput(opt.debug);
	}
	try {
		db.connect();
	} catch (e) {
		if (!noAutoDB.includes(action.name())) throw e;
	}
});

program.hook('postAction', async (_, action: Command) => {
	if (!noAutoDB.includes(action.name())) await db.database.destroy();
});

// Options shared by multiple (sub)commands
const opts = {
	// database specific
	host: new Option('-H, --host <host>', 'the host of the database.').argParser(value => {
		const [hostname, port] = value?.split(':') ?? [];
		config.db.host = hostname || config.db.host;
		config.db.port = port && Number.isSafeInteger(parseInt(port)) ? parseInt(port) : config.db.port;
	}),
	check: new Option('--check', 'check the database schema after initialization').default(false),
	force: new Option('-f, --force', 'force the operation').default(false),
	global: new Option('-g, --global', 'apply the operation globally').default(false),
	timeout: new Option('-t, --timeout <ms>', 'how long to wait for commands to complete.').default('1000').argParser(value => {
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

const axiumDB = program.command('db').alias('database').description('Manage the database').addOption(opts.timeout).addOption(opts.host);

interface OptDB extends OptCommon {
	host: string;
	force: boolean;
}

axiumDB
	.command('init')
	.description('Initialize the database')
	.addOption(opts.force)
	.option('-s, --skip', 'If the user, database, or schema already exists, skip trying to create it.')
	.addOption(opts.check)
	.action(async (_localOpts, _: Command) => {
		const opt = _.optsWithGlobals<OptDB & { skip: boolean; check: boolean }>();
		await db.init(opt).catch(io.handleError);
	});

axiumDB
	.command('status')
	.alias('stats')
	.description('Check the status of the database')
	.action(async () => {
		try {
			console.log(await db.statText());
		} catch {
			io.output.error('Unavailable');
			process.exitCode = 1;
		}
	});

axiumDB
	.command('drop')
	.description('Drop the Axium database and user')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		const stats = await db.count('users', 'passkeys', 'sessions').catch(io.exit);

		if (!opt.force)
			for (const key of ['users', 'passkeys', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				io.output.warn(`Database has existing ${key}. Use --force if you really want to drop the database.`);
				process.exit(2);
			}

		await db.uninstall(opt).catch(io.exit);
	});

axiumDB
	.command('wipe')
	.description('Wipe the database')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		const stats = await db.count('users', 'passkeys', 'sessions').catch(io.exit);

		if (!opt.force)
			for (const key of ['users', 'passkeys', 'sessions'] as const) {
				if (stats[key] == 0) continue;

				io.output.warn(`Database has existing ${key}. Use --force if you really want to wipe the database.`);
				process.exit(2);
			}

		await db.wipe(opt).catch(io.exit);
	});

axiumDB
	.command('check')
	.description('Check the structure of the database')
	.option('-s, --strict', 'Throw errors instead of emitting warnings for most column problems')
	.action(async (opt: OptDB & { strict: boolean }) => {
		await db.check(opt).catch(io.exit);
	});

axiumDB
	.command('clean')
	.description('Remove expired rows')
	.addOption(opts.force)
	.action(async (opt: OptDB) => {
		await db.clean(opt).catch(io.exit);
	});

axiumDB
	.command('rotate-password')
	.description('Generate a new password for the database user and update the config')
	.action(db.rotatePassword);

interface OptConfig extends OptCommon {
	global: boolean;
	json: boolean;
	redact: boolean;
}

const axiumConfig = program
	.command('config')
	.description('Manage the configuration')
	.addOption(opts.global)
	.option('-j, --json', 'values are JSON encoded')
	.option('-r, --redact', 'Do not output sensitive values');

function configReplacer(opt: OptConfig) {
	return (key: string, value: any) => {
		return opt.redact && ['password', 'secret'].includes(key) ? '[redacted]' : value;
	};
}

axiumConfig
	.command('dump')
	.description('Output the entire current configuration')
	.action(() => {
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
		const value = config.plain();
		console.log(opt.json ? JSON.stringify(value, configReplacer(opt), 4) : value);
	});

axiumConfig
	.command('get')
	.description('Get a config value')
	.argument('<key>', 'the key to get')
	.action((key: string) => {
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
		const value = getByString(config.plain(), key);
		console.log(opt.json ? JSON.stringify(value, configReplacer(opt), 4) : value);
	});

axiumConfig
	.command('set')
	.description('Set a config value. Note setting objects is not supported.')
	.argument('<key>', 'the key to set')
	.argument('<value>', 'the value')
	.action((key: string, value: string) => {
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
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
		const opt = axiumConfig.optsWithGlobals<OptConfig>();
		const schema = z.toJSONSchema(FileSchema, { io: 'input' });
		console.log(opt.json ? JSON.stringify(schema, configReplacer(opt), 4) : schema);
	});

const axiumPlugin = program.command('plugin').alias('plugins').description('Manage plugins').addOption(opts.global);

axiumPlugin
	.command('list')
	.alias('ls')
	.description('List loaded plugins')
	.option('-l, --long', 'use the long listing format')
	.option('--no-versions', 'do not show plugin versions')
	.action((opt: OptCommon & { long: boolean; versions: boolean }) => {
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

function _findPlugin(search: string): PluginInternal {
	const plugin = plugins.get(search) ?? plugins.values().find(p => p.specifier.toLowerCase() == search.toLowerCase());
	if (!plugin) io.exit(`Can't find a plugin matching "${search}"`);
	return plugin;
}

axiumPlugin
	.command('info')
	.description('Get information about a plugin')
	.argument('<plugin>', 'the plugin to get information about')
	.action((search: string) => {
		const plugin = _findPlugin(search);
		console.log(pluginText(plugin));
	});

axiumPlugin
	.command('remove')
	.alias('rm')
	.description('Remove a plugin')
	.argument('<plugin>', 'the plugin to remove')
	.action(async (search: string, opt: OptCommon) => {
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
	.action(async (search: string, opt: OptCommon & { check: boolean }) => {
		const plugin = _findPlugin(search);
		if (!plugin) io.exit(`Can't find a plugin matching "${search}"`);

		await using _ = db.connect();
		await plugin._hooks?.db_init?.({ force: false, ...opt, skip: true });
	});

const axiumApps = program.command('apps').description('Manage Axium apps').addOption(opts.global);

axiumApps
	.command('list')
	.alias('ls')
	.description('List apps added by plugins')
	.option('-l, --long', 'use the long listing format')
	.option('-b, --builtin', 'include built-in apps')
	.action((opt: OptCommon & { long: boolean; builtin: boolean }) => {
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

const lookup = new Argument('<user>', 'the UUID or email of the user to operate on').argParser(
	async (lookup: string): Promise<UserInternal> => {
		const value = await (lookup.includes('@') ? z.email() : z.uuid())
			.parseAsync(lookup.toLowerCase())
			.catch(() => io.exit('Invalid user ID or email.'));

		const result = await db
			.connect()
			.selectFrom('users')
			.where(value.includes('@') ? 'email' : 'id', '=', value)
			.selectAll()
			.executeTakeFirst();

		if (!result) io.exit('No user with matching ID or email.');

		return result;
	}
);

/**
 * Updates an array of strings by adding or removing items.
 * Only returns whether the array was updated and diff text for what actually changed.
 */
function diffUpdate(original: string[], add?: string[], remove?: string[]): [updated: boolean, newValue: string[], diffText: string] {
	const diffs: string[] = [];

	// update the values
	if (add) {
		for (const role of add) {
			if (original.includes(role)) continue;
			original.push(role);
			diffs.push(styleText('green', '+' + role));
		}
	}
	if (remove)
		original = original.filter(item => {
			const allow = !remove.includes(item);
			if (!allow) diffs.push(styleText('red', '-' + item));
			return allow;
		});

	return [!!diffs.length, original, diffs.join(', ')];
}

interface OptUser extends OptCommon {
	sessions: boolean;
	passkeys: boolean;
	addRole?: string[];
	removeRole?: string[];
	tag?: string[];
	untag?: string[];
	delete?: boolean;
	suspend?: boolean;
	unsuspend?: boolean;
}

program
	.command('user')
	.description('Get or change information about a user')
	.addArgument(lookup)
	.option('-S, --sessions', 'show user sessions')
	.option('-P, --passkeys', 'show user passkeys')
	.option('--add-role <role...>', 'add roles to the user')
	.option('--remove-role <role...>', 'remove roles from the user')
	.option('--tag <tag...>', 'Add tags to the user')
	.option('--untag <tag...>', 'Remove tags from the user')
	.option('--delete', 'Delete the user')
	.option('--suspend', 'Suspend the user')
	.addOption(new Option('--unsuspend', 'Un-suspend the user').conflicts('suspend'))
	.action(async (_user: Promise<UserInternal>, opt: OptUser) => {
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
			using rl = readline();
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
	.addArgument(lookup)
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
	.addOption(opts.host)
	.action(async () => {
		console.log('Axium Server v' + $pkg.version);

		console.log(styleText('whiteBright', 'Debug mode:'), config.debug ? styleText('yellow', 'enabled') : 'disabled');

		const configFiles = config.files.keys().toArray();
		console.log(
			styleText('whiteBright', 'Loaded config files:'),
			styleText(['dim', 'bold'], `(${configFiles.length})`),
			configFiles.join(', ')
		);

		process.stdout.write(styleText('whiteBright', 'Daemon: '));

		const daemonIs = (sub: string) =>
			spawnSync('systemctl', ['is-' + sub, 'axiumd'], {
				stdio: 'pipe',
				encoding: 'utf8',
			});

		const { status: dNotActive, stdout: dStatus } = daemonIs('active');
		const { status: dNotFailed } = daemonIs('failed');
		const { stdout: dEnabled } = daemonIs('enabled');

		if (dEnabled.trim() == 'not-found') console.log(styleText('dim', 'not found'));
		else {
			process.stdout.write(dEnabled.trim() + ', ');
			const status = dStatus.trim();
			if (!dNotFailed) console.log(styleText('red', status));
			else if (!dNotActive) console.log(styleText('green', status));
			else console.log(styleText('yellow', status));
		}

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
	.addArgument(new Argument('<action>', 'The action to take').choices(io._portActions))
	.addOption(new Option('-m, --method <method>', 'the method to use').choices(io._portMethods).default('node-cap'))
	.option('-N, --node <path>', 'the path to the node binary')
	.action(async (action: io.PortOptions['action'], opt: OptCommon & Omit<io.PortOptions, 'action'>) => {
		await io.restrictedPorts({ ...opt, action }).catch(io.handleError);
	});

program
	.command('init')
	.description('Install Axium server')
	.addOption(opts.force)
	.addOption(opts.host)
	.addOption(opts.check)
	.addOption(opts.packagesDir)
	.action(async (opt: OptDB & { dbSkip: boolean; check: boolean; packagesDir?: string }) => {
		await db.init({ ...opt, skip: opt.dbSkip }).catch(io.handleError);
		await io.restrictedPorts({ method: 'node-cap', action: 'enable' }).catch(io.handleError);
	});

program
	.command('serve')
	.description('Start the Axium server')
	.option('-p, --port <port>', 'the port to listen on')
	.option('--ssl <prefix>', 'the prefix for the cert.pem and key.pem SSL files')
	.option('-b, --build <path>', 'the path to the handler build')
	.action(async (opt: OptCommon & { ssl?: string; port?: string; build?: string }) => {
		const server = await serve({
			secure: opt.ssl ? true : config.web.secure,
			ssl_cert: opt.ssl ? join(opt.ssl, 'cert.pem') : config.web.ssl_cert,
			ssl_key: opt.ssl ? join(opt.ssl, 'key.pem') : config.web.ssl_key,
			build: opt.build ? resolve(opt.build) : undefined,
		});

		const port = !Number.isNaN(Number.parseInt(opt.port ?? '')) ? Number.parseInt(opt.port!) : config.web.port;

		server.listen(port, () => {
			console.log('Server is listening on port ' + port);
		});
	});

program
	.command('link')
	.description('Link routes provided by plugins and the server')
	.addOption(opts.packagesDir)
	.addOption(new Option('-l, --list', 'list route links').conflicts('delete'))
	.option('-d, --delete', 'delete route links')
	.argument('[name...]', 'List of plugin names to operate on. If not specified, operates on all plugins and built-in routes.')
	.action(async function (this: Command, names: string[]) {
		const opt = this.optsWithGlobals<OptCommon & LinkOptions & { list?: boolean; delete?: boolean }>();
		if (names.length) opt.only = names;

		if (opt.list) {
			for (const link of listRouteLinks(opt)) {
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
			unlinkRoutes(opt);
			return;
		}

		linkRoutes(opt);
	});

interface AuditCLIOptions extends AuditFilter {
	summary: boolean;
	extra: boolean;
	includeTags: boolean;
}

program
	.command('audit')
	.description('View audit logs')
	.option('-x, --extra', 'Include the extra object when listing events')
	.option('-t, --include-tags', 'Include tags when listing events')
	.addOption(
		new Option('-s, --summary', 'Summarize audit log entries instead of displaying individual ones').conflicts(['extra', 'includeTags'])
	)
	.optionsGroup('Filters:')
	.addOption(new Option('--since <date>', 'Filter for events since a date').argParser(v => new Date(v)))
	.addOption(new Option('--until <date>', 'Filter for events until a date').argParser(v => new Date(v)))
	.addOption(
		new Option('--user <uuid|null>', 'Filter for events triggered by a user').argParser(v => {
			try {
				return z.union([z.uuid(), z.literal(['null', '']).transform(() => null)]).parse(v);
			} catch (e: any) {
				throw z.prettifyError(e);
			}
		})
	)
	.addOption(
		new Option('--severity <level>', 'Filter for events at or above a severity level')
			.choices(
				Object.keys(Severity)
					.filter(k => isNaN(Number(k)))
					.map(uncapitalize) as Lowercase<keyof typeof Severity>[]
			)
			.argParser(v => {
				const cap = capitalize(v);
				if (!(cap in Severity)) throw new Error('Invalid severity: ' + v);
				return Severity[cap as keyof typeof Severity];
			})
	)
	.option('--source <source>', 'Filter by source')
	.option('--tag <tag...>', 'Filter by tag(s)')
	.option('--event <event>', 'Filter by event name')
	.action(async (opt: AuditCLIOptions) => {
		const events: (AuditEvent & { _extra?: string; _tags?: string })[] = await getEvents(opt);

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

program.parse();
