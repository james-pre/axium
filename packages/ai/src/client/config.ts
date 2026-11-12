import { getConfig } from '@axium/core';
import { Manager } from '@james-pre/config';
import * as io from 'ioium/node';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PartialRecursive } from 'utilium';
import * as z from 'zod';
import * as ai from '../common.js';
import type * as llama from '../node/llama.js';
import type { Registered } from '../node/models.js';

const LocalModel = ai.Model.pick({ id: true, name: true, source: true, created: true, reasoning: true, systemPrompt: true }).extend({
	/** Bytes; JSON has no big integers */
	size: z.number().nonnegative(),
	options: ai.ModelOptions.default({}),
	reasoningLevels: z.string().array().nullish(),
	templateReasoning: z.string().nullish(),
	tools: z.boolean().nullish(),
	learned: z.coerce.date().nullish().default(null),
});
type LocalModel = z.infer<typeof LocalModel>;

const LocalConfig = z.object({
	/** Where models and llama-server's files are kept */
	data_dir: z.string().default(join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'axium/ai')),
	/** Overrides of the server's default llama-server settings */
	llama: ai.LlamaConfig.partial().default({}),
	models: LocalModel.array().default([]),
	/** Local models for each role, most preferred first; the server's roles are used after these */
	roles: ai.RolesUpdate.default({}),
});

export const configManager = new Manager(LocalConfig, { xdg: 'axium/ai' })
	.on('load_error', (path, stage, error) => {
		if ((error as NodeJS.ErrnoException).code == 'ENOENT') return;
		io.warn(`AI: could not load ${path}:`, io.errorText(error));
	})
	.on('write', path => io.debug('AI: saved config to', path));

configManager.loadDefaults();

/** The device's AI config; other processes may change it, see {@link updateConfig} */
export const config = configManager.data;

/** Saves changes to the device's AI config, keeping changes other processes made */
export function updateConfig(change: (current: typeof config) => PartialRecursive<z.input<typeof LocalConfig>>): void {
	configManager.reloadFiles();
	configManager.update(change(config));
}

/** The port llama-server listens on for the device, so it doesn't clash with a server on the same machine */
const devicePort = 6688;

export function settings(): llama.Settings {
	const base = getConfig('@axium/ai').llama;
	return {
		data_dir: config.data_dir,
		llama: { ...base, port: devicePort, ...config.llama, defaults: { ...base.defaults, ...config.llama.defaults } },
	};
}

export function toRecord(model: LocalModel): Registered {
	return { ...model, size: BigInt(model.size) };
}

export function fromRecord(record: Registered): LocalModel {
	return { ...record, size: Number(record.size) };
}
