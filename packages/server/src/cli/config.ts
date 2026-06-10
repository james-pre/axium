import { program } from 'commander';
import * as io from 'ioium/node';
import { getByString, isJSON, setByString } from 'utilium';
import * as z from 'zod';
import config, { ConfigFile } from '../config.js';
import { sharedOptions as opts } from './common.js';

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
			const schema = z.toJSONSchema(ConfigFile, { io: 'input' });
			console.log(opt.json ? JSON.stringify(schema, configReplacer(opt), 4) : schema);
		} catch (e: any) {
			io.exit(e);
		}
	});
