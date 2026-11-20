import { SecretStore, serverConfigs } from '@axium/core';
import { plugins } from '@axium/core/plugins';
import { Argument, Option, program } from 'commander';
import * as io from 'ioium/node';
import { text } from 'node:stream/consumers';
import { styleText } from 'node:util';
import { configManager } from '../config.js';
import * as secrets from '../secrets.js';

const storeChoices = Array.from(SecretStore.values);

/** Every secret the main config and loaded plugins define */
function knownIds(): string[] {
	const ids = [...secrets.paths(configManager.schema)];
	for (const [name, schema] of serverConfigs) {
		if (plugins.has(name)) ids.push(...secrets.paths(schema).map(path => secrets.idFor(path, name)));
	}
	return ids;
}

/** Accepts systemd credential names too, e.g. `axium.db.password` */
function parseId(input: string): string {
	const id = input.replace(/^axium\./, '');
	if (knownIds().includes(id)) return id;
	throw `Unknown secret "${input}". Use \`axium secret list\` to see the available secrets.`;
}

/** Read all of piped input, or prompt for a value without showing it */
async function readValue(id: string): Promise<string> {
	if (process.stdin.isTTY) return await io.askHidden(`Value for ${id}: `);
	return (await text(process.stdin)).replace(/\r?\n$/, '');
}

function applyNotice(store: SecretStore): void {
	io.info(store == 'systemd' ? 'Restart Axium for changes to take effect.' : 'Reload or restart Axium for changes to take effect.');
}

const argId = new Argument('<id>', 'the secret, e.g. db.password').argParser(parseId);

const optStore = new Option('-s, --store <store>', 'where to store secrets (defaults to secret_store)').choices(storeChoices);

const axiumSecret = program.command('secret').alias('secrets').description('Manage secrets');

axiumSecret
	.command('list')
	.alias('ls')
	.description('List secrets and where they are stored')
	.action(() => {
		console.log(styleText('whiteBright', 'New secrets are stored in:'), secrets.defaultStore());
		for (const id of knownIds()) {
			const source = secrets.get(id)?.source;
			console.log(id.padEnd(32), source ?? styleText('dim', 'not set'));
		}
	});

axiumSecret
	.command('set')
	.description('Store a secret, read from standard input')
	.addArgument(argId)
	.addOption(optStore)
	.action(async (id: string, { store = secrets.defaultStore() }: { store?: SecretStore }) => {
		const value = await readValue(id).catch(io.exit);
		try {
			secrets.set(id, value, store);
		} catch (e) {
			io.exit(e);
		}
		io.log(`Stored ${id} (${store})`);
		applyNotice(store);
	});

axiumSecret
	.command('remove')
	.alias('rm')
	.alias('unset')
	.description('Remove a secret')
	.addArgument(argId)
	.addOption(new Option('-s, --store <store>', 'only remove it from this store').choices(storeChoices))
	.action((id: string, { store }: { store?: SecretStore }) => {
		try {
			secrets.remove(id, store);
		} catch (e) {
			io.exit(e);
		}
		io.log(`Removed ${id}`);
		applyNotice(store ?? secrets.defaultStore());
	});

