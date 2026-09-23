#! /usr/bin/env node

import { createPluginCommand } from '@axium/core/node';
import { waitForPlugins } from '@axium/core/node/plugins';
import { _findPlugin, plugins } from '@axium/core/plugins';
import { configCommand } from '@james-pre/config/cli';
import { Service } from '@james-pre/systemd';
import { serviceCommand } from '@james-pre/systemd/cli';
import { CommanderError, program } from 'commander';
import * as io from 'ioium/node';
import { basename, join } from 'node:path';
import { styleText } from 'node:util';
import { bytes as formatBytes } from 'utilium/format';
import * as z from 'zod';
import $pkg from '../../package.json' with { type: 'json' };
import { prefix, useUserAgent } from '../requests.js';
import { connect as connectSocket } from '../socket.js';
import { logout } from '../user.js';
import { clientUA, login } from './auth.js';
import * as cache from './cache.js';
import { config, configManager, session } from './config.js';

const safe = z.stringbool().default(false).parse(process.env.SAFE?.toLowerCase()) || process.argv.includes('--safe');
const debug = z.stringbool().default(false).parse(process.env.DEBUG?.toLowerCase()) || process.argv.includes('--debug');

if (debug) io._setDebugOutput(true);

useUserAgent(clientUA);

const loadOptions = { plugins: { safe } };

configManager.loadDefaults(loadOptions);
await waitForPlugins();
cache.load();

process.on('SIGHUP', () => {
	io.info('Reloading configuration due to SIGHUP.');
	configManager.reloadFiles({ plugins: { safe, reload: true } });
});

program
	.version($pkg.version)
	.name('axium-client')
	.alias('axc')
	.description('Axium client CLI')
	.configureHelp({ showGlobalOptions: true })
	.option('--debug', 'override debug mode')
	.option('--no-debug', 'override debug mode')
	.option('--refresh', 'Force an update of caches from server', false)
	.option('--cache-only', 'Run entirely from local cache, even if it is expired.', false)
	.option('--safe', 'do not execute code from plugins', false)
	.hook('preAction', async (axc, action) => {
		const opt = axc.optsWithGlobals();

		if (!config.token) return;
		if (!opt.cacheOnly && action.name() != 'login') await cache.update(opt.refresh);
	});

program.on('option:debug', () => io._setDebugOutput(true));

program.command('login').description('Log in to your account on an Axium server').argument('[server]', 'Axium server URL').action(login);

program.command('logout').action(async () => {
	const { id, userId } = session();

	await logout(userId, id);
});

configCommand(program, configManager, { defaultType: 'user', sensitive: ['token'] });
serviceCommand(program, {
	service: user => new Service('axium-client', { user: user ?? true }),
	source: () => ({ link: join(import.meta.dirname, '../../axium-client.service') }),
});

program.command('status').action(() => {
	if (!config.token) return console.log('Not logged in.');

	const { session } = cache.meta.data || {};
	if (!session) return console.log('No session data available.');

	console.log('Logged in to', new URL(prefix).host);
	console.log(
		styleText('whiteBright', 'Session:'),
		'valid until',
		session.expires.toLocaleDateString(),
		styleText('dim', `(${session.id})`)
	);
	const { user } = session;
	console.log(styleText('whiteBright', 'User:'), user.name, `<${user.email}>`, styleText('dim', `(${user.id})`));
	console.log(styleText('whiteBright', 'Daemon:'), new Service('axium-client', { user: true }).shortStatus());
});

program
	.command('daemon')
	.description('Run as the Axium client daemon')
	.option('--no-socket', 'do not open a socket connection to the server')
	.option('--insecure', 'allow connecting to a server with an untrusted (e.g. self-signed) TLS certificate', false)
	.action(async opt => {
		for (const plugin of plugins.values()) await plugin._client?.run?.();

		// Hold a socket connection to the server for the lifetime of the daemon.
		if (opt.socket && config.token) await connectSocket({ rejectUnauthorized: !opt.insecure });
	});

const axcPlugin = createPluginCommand('client', program, {
	safe,
	loadedBy: () => configManager.filePaths.next().value!,
	enabled: config.plugins,
	enable: spec => configManager.update({ plugins: [...config.plugins, spec] }),
	disable: spec => configManager.update({ plugins: config.plugins.filter(p => p !== spec) }),
});

axcPlugin
	.command('run')
	.description('Run a plugin')
	.argument('<plugin>', 'the plugin to run')
	.action(async (search: string) => {
		const plugin = _findPlugin(search);
		await plugin._client?.run?.();
	});

const axcCache = program.command('cache').description('Manage the local cache');

axcCache
	.command('info')
	.description('Show information about what is being cached')
	.action(async () => {
		let size = 0n,
			files = 0;

		for await (const info of cache.info()) {
			process.stdout.write(basename(info.path) + ':');

			if (!info.exists) {
				console.log(styleText('dim', ' (missing)'));
				continue;
			}

			files++;
			size += info.size!;

			console.log(
				'',
				styleText('blue', formatBytes(info.size!)) + ',',
				info.fromAPI ? info.entries + ' entries' : info.valid ? styleText('green', 'valid') : styleText('yellow', 'invalid')
			);
		}

		console.log('Caching', styleText('blue', formatBytes(size)), 'across', styleText('blueBright', files.toString()), 'files');
	});

axcCache.command('clear').description('Clear the local cache').action(cache.clear);

axcCache
	.command('refresh')
	.description('Update local caches')
	.option('-f, --force', 'Force a refresh even if the cache is still valid')
	.action(async opt => {
		await cache.update(opt.force);
	});

try {
	await program.parseAsync();
} catch (e) {
	if (e && e instanceof CommanderError) {
		process.exit(1);
	} else {
		if (typeof e == 'number') process.exit(e);
		io.done(true);
		io.exit(e);
	}
}
