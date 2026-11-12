import * as ai from '../common.js';
import * as hub from '../hub.js';
import * as llama from '../node/llama.js';
import * as models from '../node/models.js';
import { config, fromRecord, settings, toRecord, updateConfig } from './config.js';

llama.useSettings(settings);

function records(): models.Registered[] {
	return config.models.map(toRecord).sort((a, b) => a.name.localeCompare(b.name));
}

models.useRegistry({
	records: () => Promise.resolve(records()),
	record: id => Promise.resolve(records().find(record => record.id == id)),
	saveCapabilities(id, capabilities) {
		updateConfig(current => ({
			models: current.models.map(model => (model.id == id ? { ...model, ...capabilities } : model)),
		}));
		const saved = config.models.find(model => model.id == id);
		return saved ? Promise.resolve(toRecord(saved)) : Promise.reject(new ReferenceError(`Model "${id}" not found`));
	},
});

/**
 * Uses the llama-server the device daemon runs.
 * @throws when it isn't running
 */
export async function connect(): Promise<void> {
	if (await llama.attach()) return;
	throw new Error("llama-server isn't running on this device. Start the Axium client daemon with `axc daemon`.");
}

/** The device's models and roles, with their current state */
export async function getModels(): Promise<Pick<ai.Models, 'models' | 'roles' | 'memory' | 'running'>> {
	return { models: await models.list(), roles: getRoles(), memory: models.getMemory(), running: llama.isRunning() };
}

export function getRoles(): ai.Roles {
	const { roles } = config;
	return Object.fromEntries(ai.roles.map(role => [role, roles[role] ?? []])) as ai.Roles;
}

/** Replaces the local model lists of the given roles */
export function setRoles(update: ai.RolesUpdate): void {
	const known = new Set(records().map(record => record.id));
	for (const role of ai.roles) {
		const list = update[role];
		if (!list) continue;
		const unknown = list.find(id => !known.has(id));
		if (unknown) throw new ReferenceError(`There is no local model "${unknown}"`);
		if (new Set(list).size != list.length) throw new Error('A model is listed twice for the same role');
	}

	updateConfig(current => ({ roles: { ...current.roles, ...update } }));
}

export function details(repo: string): Promise<ai.HubDetails> {
	return hub.details(repo, models.getCapacity(), settings().llama.hf_token);
}

export function search(query: string): Promise<ai.HubRepo[]> {
	return hub.search(query, settings().llama.hf_token);
}

/** Saves a model and starts downloading it */
export async function add(init: ai.ModelInit): Promise<ai.Model> {
	if (records().some(record => record.id == init.id)) throw new Error(`A model with the ID "${init.id}" already exists`);

	const repo = await details(init.repo);
	const quant = repo.quants.find(quant => quant.tag == init.quant);
	if (!quant) throw new Error(`${repo.repo} has no ${init.quant} quantization`);

	const record: models.Registered = {
		id: init.id,
		name: init.name,
		source: `${repo.repo}:${quant.tag}`,
		size: quant.size,
		created: new Date(),
		reasoning: null,
		systemPrompt: null,
		options: init.options ?? {},
		reasoningLevels: null,
		templateReasoning: null,
		tools: null,
		learned: null,
	};

	updateConfig(current => ({ models: [...current.models, fromRecord(record)] }));

	try {
		await models.syncPreset();
		await llama.download(record.source);
	} catch (error) {
		updateConfig(current => ({ models: current.models.filter(model => model.id != init.id) }));
		await models.syncPreset().catch(() => {});
		throw error;
	}

	return models.toModel(record);
}

/** Deletes a model, and its files unless another model uses them */
export async function remove(id: string): Promise<void> {
	const model = await models.get(id);
	if (!model) throw new ReferenceError(`There is no local model "${id}"`);

	if (model.status == 'loaded' || model.status == 'loading' || model.status == 'sleeping') await llama.unload(id);

	const shared = records().some(record => record.id != id && record.source == model.source);
	if (!shared) {
		await llama.remove(model.source).catch(error => {
			if (model.status != 'unavailable') throw error;
		});
	}

	updateConfig(current => ({
		models: current.models.filter(model => model.id != id),
		roles: Object.fromEntries(Object.entries(current.roles).map(([role, ids]) => [role, ids.filter(model => model != id)])),
	}));
	await models.syncPreset();
}
