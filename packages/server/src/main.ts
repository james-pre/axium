#!/usr/bin/env node
import { runIntegrations } from '@axium/core/plugins';
import { program } from 'commander';
import * as io from 'ioium/node';
import { parseArgs } from 'node:util';
import * as z from 'zod';
import './cli/index.js';
import { configManager, loadConfigFromDirs } from './config.js';

process.on('SIGHUP', () => {
	io.info('Reloading configuration due to SIGHUP.');
	configManager.reloadFiles();
});

// Need these before Command is set up (e.g. for CLI integrations)
const {
	safe,
	debug,
	config: configFromCLI,
} = parseArgs({
	options: {
		safe: { type: 'boolean', default: z.stringbool().default(false).parse(process.env.SAFE?.toLowerCase()) },
		debug: { type: 'boolean', default: z.stringbool().default(false).parse(process.env.DEBUG?.toLowerCase()) },
		config: { type: 'string', short: 'c' },
	},
	allowPositionals: true,
	strict: false,
}).values as { safe: boolean; debug: boolean; config?: string };

if (debug) {
	io._setDebugOutput(true);
	configManager.set('debug', true);
}

const options = { plugins: { safe } };

configManager.loadDefaults(options);

loadConfigFromDirs(options);

if (configFromCLI) configManager.loadFile(configFromCLI, options);

await runIntegrations();

try {
	await program.parseAsync();
} catch (e) {
	if (typeof e == 'number') process.exit(e);
	io.done(true);
	io.exit(e);
}
