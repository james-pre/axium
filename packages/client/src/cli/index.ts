#! /usr/bin/env node

import { formatBytes } from '@axium/core';
import { loadPlugin, outputDaemonStatus, pluginText } from '@axium/core/node';
import { _findPlugin, plugins } from '@axium/core/plugins';
import { CommanderError, program } from 'commander';
import * as io from 'ioium/node';
import { basename } from 'node:path';
import { styleText } from 'node:util';
import * as z from 'zod';
import $pkg from '../../package.json' with { type: 'json' };
import { config } from '../config.js';
import { prefix, useUserAgent } from '../requests.js';
import { connect as connectSocket } from '../socket.js';
import { logout } from '../user.js';
import { clientUA, login } from './auth.js';
import * as cache from './cache.js';
import { axcConfigPath, loadConfig, saveConfig, session } from './config.js';

const safe = z.stringbool().default(false).parse(process.env.SAFE?.toLowerCase()) || process.argv.includes('--safe');
const debug = z.stringbool().default(false).parse(process.env.DEBUG?.toLowerCase()) || process.argv.includes('--debug');

if (debug) io._setDebugOutput(true);

useUserAgent(clientUA);

await loadConfig(safe);
cache.load();

process.on('SIGHUP', () => {
	io.info('Reloading configuration due to SIGHUP.');
	void loadConfig(safe);
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

	outputDaemonStatus('axium-client');
});

program
	.command('daemon')
	.description('Run as the Axium client daemon')
	.option('--no-socket', 'do not open a socket connection to the server')
	.action(async opt => {
		for (const plugin of plugins.values()) await plugin._client?.run();

		// Hold a socket connection to the server for the lifetime of the daemon.
		if (opt.socket && config.token) await connectSocket();
	});

const axcPlugin = program.command('plugin').alias('plugins').description('Manage plugins');

axcPlugin
	.command('run')
	.description('Run a plugin')
	.argument('<plugin>', 'the plugin to run')
	.action(async (search: string) => {
		const plugin = _findPlugin(search);
		await plugin._client?.run();
	});

axcPlugin
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
			console.log(plugins.keys().toArray().join(', '));
			return;
		}

		console.log(styleText('whiteBright', plugins.size + ' plugin(s) loaded:'));

		for (const plugin of plugins.values()) {
			console.log(plugin.name, opt.versions ? plugin.version : '');
		}
	});

axcPlugin
	.command('info')
	.description('Get information about a plugin')
	.argument('<plugin>', 'the plugin to get information about')
	.action((search: string) => {
		const plugin = _findPlugin(search);
		for (const line of pluginText(plugin)) console.log(line);
	});

axcPlugin
	.command('add')
	.description('Add a plugin')
	.option('-k, --keep-going', 'continue adding plugins even if one fails')
	.argument('<spec...>', 'the plugin specifier (e.g. a package name) to add')
	.action(async (specs: string[], { keepGoing }) => {
		for (const spec of specs) {
			try {
				if (config.plugins.includes(spec)) throw `Plugin "${spec}" is already added.`;

				const plugin = await loadPlugin('client', spec, axcConfigPath, safe);
				if (!plugin) throw `Failed to load a client plugin from "${spec}".`;

				config.plugins.push(spec);
				saveConfig();
				console.log('Added plugin:', plugin.name, styleText('dim', 'v' + plugin.version));
			} catch (e) {
				if (keepGoing) io.error(e);
				else io.exit(e);
			}
		}
	});

axcPlugin
	.command('remove')
	.alias('rm')
	.description('Remove a plugin')
	.argument('<plugin>', 'the plugin to remove')
	.action((search: string) => {
		const plugin = _findPlugin(search);

		config.plugins = config.plugins.filter(p => p !== plugin.specifier);

		plugins.delete(plugin.name);
		saveConfig();
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
