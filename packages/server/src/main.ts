#!/usr/bin/env node
import { runIntegrations } from '@axium/core/plugins';
import { program } from 'commander';
import * as io from 'ioium/node';
import { parseArgs } from 'node:util';
import * as z from 'zod';
import './cli/db.js';
import config, { reloadConfigs } from './config.js';

import { rl } from './cli/index.js';

process.on('SIGHUP', () => {
	io.info('Reloading configuration due to SIGHUP.');
	void reloadConfigs();
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
	config.set({ debug: true });
}

await config.loadDefaults(safe);

if (configFromCLI) await config.load(configFromCLI, { safe });

await runIntegrations();

try {
	await program.parseAsync();
} catch (e) {
	if (typeof e == 'number') process.exit(e);
	io.done(true);
	io.exit(e);
}

rl.close();
