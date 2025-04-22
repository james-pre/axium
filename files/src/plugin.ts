import type { Database, InitOptions, OpOptions, PluginShortcuts } from '@axium/server/database.js';
import type { WithOutput } from '@axium/server/io.js';
import { styleText } from 'node:util';
import pkg from '../package.json' with { type: 'json' };

export const id = pkg.name;
export const name = 'Axium Files';
export const version = pkg.version;
export const description = pkg.description;

export async function statusText(): Promise<string> {
	return styleText('italic', 'Work In Progress');
}

export async function db_init(opt: InitOptions & WithOutput, db: Database, { warnExists, done }: PluginShortcuts) {}

export async function db_wipe(opt: OpOptions & WithOutput, db: Database) {}
