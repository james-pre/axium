import { pluginText } from '@axium/core/node';
import { _findPlugin, plugins } from '@axium/core/plugins';
import { program } from 'commander';
import * as io from 'ioium/node';
import { styleText } from 'node:util';
import { configFiles, saveConfigTo } from '../config.js';
import * as db from '../db/index.js';
import { sharedOptions as opts, rlConfirm } from './common.js';

const axiumPlugin = program.command('plugins').alias('plugin').description('Manage plugins').addOption(opts.global);

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
		const info = db.getUpgradeInfo();
		const exclude = Object.keys(info.current);
		if (exclude.includes(plugin.name)) io.exit('Plugin is already initialized (database)');
		const schema = db.schema.getFull({ exclude });
		const delta = db.delta.compute({ tables: {}, indexes: {} }, schema);
		if (db.delta.isEmpty(delta)) {
			io.info('Plugin does not define any database schema.');
			return;
		}
		for (const text of db.delta.display(delta)) console.log(text);
		await rlConfirm();
		await db.delta.apply(delta);
		Object.assign(info.current, schema.versions);
		db.setUpgradeInfo(info);
	});
