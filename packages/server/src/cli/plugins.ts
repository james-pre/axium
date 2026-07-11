import { assertYes, createPluginCommand } from '@axium/core/node';
import { _findPlugin, plugins } from '@axium/core/plugins';
import { program } from 'commander';
import * as io from 'ioium/node';
import * as z from 'zod';
import { configFiles, findConfigPaths, saveConfig, saveConfigTo } from '../config.js';
import * as db from '../db/index.js';
import { sharedOptions as opts } from './common.js';

const safe = z.stringbool().default(false).parse(process.env.SAFE?.toLowerCase()) || process.argv.includes('--safe');

/** The config file a plugin is enabled into, mirroring how `config.save` picks its target. */
const targetConfigPath = (global: boolean) => findConfigPaths().at(global ? 0 : -1)!;

const axiumPlugin = createPluginCommand('server', program, {
	safe,
	loadedBy: opts => targetConfigPath(opts.global),
	get enabled() {
		return configFiles
			.values()
			.flatMap(data => data.plugins ?? [])
			.toArray();
	},
	enable(spec, { global }) {
		const path = targetConfigPath(global);
		const { plugins = [] } = configFiles.get(path) ?? {};
		plugins.push(spec);
		saveConfig({ plugins }, global);
	},
	disable(spec) {
		for (const [path, data] of configFiles) {
			if (!data.plugins?.includes(spec)) continue;
			data.plugins = data.plugins.filter(p => p !== spec);
			saveConfigTo(path, data);
		}
	},
});

// The server can enable plugins into either the global or most-local config file.
axiumPlugin.commands.find(c => c.name() === 'enable')?.addOption(opts.global);

axiumPlugin
	.command('remove')
	.alias('rm')
	.description('Remove a plugin')
	.argument('<plugin>', 'the plugin to remove')
	.action(async (search, opt) => {
		const plugin = _findPlugin(search);

		db.connect();
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
		const delta = db.delta.compute({ tables: {}, indexes: {}, scripts: [] }, schema);
		if (db.delta.isEmpty(delta)) {
			io.info('Plugin does not define any database schema.');
			return;
		}
		for (const text of db.delta.display(delta)) console.log(text);
		await assertYes();
		await db.delta.apply(delta);
		Object.assign(info.current, schema.versions);
		db.setUpgradeInfo(info);
	});
