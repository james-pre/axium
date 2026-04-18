export * from './common.js';
import type { AuditEvent } from '@axium/core';
import { apps } from '@axium/core';
import { AuditFilter, severityNames } from '@axium/core/audit';
import { formatBytes, formatMs } from '@axium/core/format';
import { outputDaemonStatus } from '@axium/core/node';
import { plugins } from '@axium/core/plugins';
import { Argument, Option, program } from 'commander';
import * as io from 'ioium/node';
import { allLogLevels } from 'logzen';
import { createWriteStream, readFileSync } from 'node:fs';
import { access, watch } from 'node:fs/promises';
import type { Http2Server } from 'node:http2';
import { join, resolve } from 'node:path/posix';
import { styleText } from 'node:util';
import type { Entries } from 'utilium';
import { searchForWorkspaceRoot } from 'vite';
import * as z from 'zod';
import $pkg from '../../package.json' with { type: 'json' };
import { getEvents, styleSeverity } from '../audit.js';
import { build } from '../build.js';
import config from '../config.js';
import * as db from '../db/index.js';
import { _portActions, _portMethods, dirs, logger, restrictedPorts, type PortOptions } from '../io.js';
import { linkRoutes, listRouteLinks, unlinkRoutes, writePluginHooks, type LinkInfo } from '../linking.js';
import { serve } from '../serve.js';
import { sharedOptions as opts } from './common.js';
import { dbInitTables } from './db.js';
// other subcommands
import './config.js';
import './db.js';
import './plugins.js';
import './user.js';

const noAutoDB = ['init', 'serve', 'check'];

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
		await restrictedPorts({ ...opt, action });
	});

program
	.command('init')
	.description('Install Axium server')
	.addOption(opts.force)
	.addOption(opts.check)
	.option('-s, --skip', 'Skip already initialized steps', false)
	.action(async opt => {
		await db.init(opt);
		await dbInitTables();
		await restrictedPorts({ method: 'node-cap', action: 'enable' });
	});

program
	.command('serve')
	.description('Start the Axium server')
	.option('-p, --port <port>', 'the port to listen on', Number.parseInt)
	.option('--ssl <prefix>', 'the prefix for the cert.pem and key.pem SSL files')
	.option('-b, --build <path>', 'the path to the handler build')
	.action(async opt => {
		opt.port ||= config.web.port;
		if (opt.port < 1 || opt.port > 65535) io.exit('Invalid port');

		const server = await serve({
			secure: opt.ssl ? true : config.web.secure,
			ssl_cert: opt.ssl ? join(opt.ssl, 'cert.pem') : config.web.ssl_cert,
			ssl_key: opt.ssl ? join(opt.ssl, 'key.pem') : config.web.ssl_key,
			build: opt.build ? resolve(opt.build) : config.web.build,
		});

		logger.attach(createWriteStream(join(dirs.at(-1)!, 'server.log')), { output: allLogLevels });

		db.connect();
		await db.clean({});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		process.on('beforeExit', () => db.database.destroy());

		server.listen(opt.port, () => {
			console.log('Server is listening on port ' + opt.port);
		});
	});

program
	.command('link')
	.description('Link routes provided by plugins and the server')
	.addOption(new Option('-l, --list', 'list route links').conflicts('delete'))
	.option('-d, --delete', 'delete route links')
	.argument('[name...]', 'List of plugin names to operate on. If not specified, operates on all plugins and built-in routes.')
	.action(async function axium_link(names: string[]) {
		const opt = this.optsWithGlobals();

		const linkOpts = { only: names };

		if (opt.list) {
			let idTextLength = 0,
				fromLength = 0,
				toLength = 0;

			const links: (LinkInfo & { idText: string })[] = [];

			for (const link of listRouteLinks(linkOpts)) {
				const idText = link.id.startsWith('#') ? `(${link.id.slice(1)})` : link.id;
				idTextLength = Math.max(idTextLength, idText.length);
				fromLength = Math.max(fromLength, link.from.length);
				toLength = Math.max(toLength, link.to.length);
				links.push(Object.assign(link, { idText }));
			}

			idTextLength++;

			for (const link of links) {
				const fromColor = await access(link.from)
					.then(() => 'cyanBright' as const)
					.catch(() => 'redBright' as const);

				console.log(
					(link.idText + ':').padEnd(idTextLength),
					styleText(fromColor, link.from.padEnd(fromLength)),
					'->',
					link.to.padEnd(toLength).replace(/.*\/node_modules\//, styleText('dim', '$&'))
				);
			}
			return;
		}

		if (opt.delete) {
			unlinkRoutes(linkOpts);
			return;
		}

		io.track('Linking routes', () => linkRoutes(linkOpts));
		io.track('Writing web client hooks for plugins', () => writePluginHooks());
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

program
	.command('build')
	.description('Create the Vite build for the server')
	.option('-v, --verbose', 'Show all output from the build process')
	.option('-s, --diagnostics', 'Show build time and bundle size')
	.option('-n, --native', 'Build for native (mobile) apps')
	.option('-m, --no-minify', 'Whether to use minification')
	.action(async options => {
		const { time, size } = await io.track('Building', build(options));

		if (options.diagnostics) {
			console.log(
				'Took',
				styleText('blueBright', formatMs(time)),
				'with a bundle size of',
				styleText('blueBright', formatBytes(size))
			);
		}
	});

program
	.command('develop')
	.alias('dev')
	.description('Develop with axium')
	.argument('[dir]', 'The project directory', searchForWorkspaceRoot(process.cwd()))
	.option('-g, --git', 'Use .gitignore to ignore files (can improve performance)')
	.action(async (dir, opts) => {
		let buildId = 0,
			server: Http2Server | undefined;

		logger.attach(createWriteStream(join(dirs.at(-1)!, 'server.log')), { output: allLogLevels });
		db.connect();
		await db.clean({});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		process.on('beforeExit', () => db.database.destroy());

		async function rebuild() {
			server?.close();
			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			process.stdout.write('Building...');
			const { time } = await build({ minify: false });
			buildId++;
			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			server = await serve(config.web);
			server.listen(config.web.port);
			process.stdout.write(`Build #${buildId} finished in ${formatMs(time)}`);
		}

		const ignore = ['node_modules', '.git'];
		try {
			if (!opts.git) throw null;
			const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8');

			for (const rawLine of gitignore.split('\n')) {
				const line = rawLine.trim();
				if (!line || line[0] == '#') continue;
				ignore.push(line);
			}
		} catch {
			// It's fine if we don't have a .gitignore
		}

		io.debug('Watching', dir);

		await rebuild();
		try {
			for await (const _event of watch(dir, { recursive: true, ignore })) {
				// @todo see if we can be more efficient based on event data
				await rebuild();
			}
		} catch (err: any) {
			if (err.name === 'AbortError') return;
			throw err;
		}
	});
