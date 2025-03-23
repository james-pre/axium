#!/usr/bin/env tsx
import { program } from 'commander';
import * as db from './database.js';

program.version('0.0.0').name('bedrock').description('Bedrock server CLI');

const bedrockDB = program.command('db');

bedrockDB
	.command('init')
	.description('initialize the database')
	.argument('<url>', 'the URL to the database, e.g. localhost:1234')
	.action(async (url, opt) => {
		await db.setup(url);
	});

program.option('--verbose', 'verbose output').parse();
