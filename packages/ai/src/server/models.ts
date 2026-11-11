import { getConfig } from '@axium/core';
import { database } from '@axium/server/database';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium';
import type { AIModel, AIModelCapabilities, AIModels } from '../common.js';
import { parseModelId } from '../common.js';
import { getDefaultReasoning, getReasoningLevels, listModels } from './chat.js';

let known: Promise<Map<string, AIModelCapabilities>> | undefined;

/** Capabilities of every model learned so far, by model ID */
function getKnown(): Promise<Map<string, AIModelCapabilities>> {
	known ??= database
		.selectFrom('ai_models')
		.selectAll()
		.execute()
		.then(
			rows =>
				new Map(
					rows.map(row => [
						row.id,
						{ id: row.id, reasoningLevels: row.reasoningLevels, defaultReasoning: row.defaultReasoning ?? undefined },
					])
				)
		)
		.catch(error => {
			known = undefined;
			throw error;
		});
	return known;
}

/** Records what a model supports, unless already known. The model must be loaded for its endpoint to report anything. */
export async function learnCapabilities(id: string): Promise<void> {
	const { endpoint: endpointName, model } = parseModelId(id);
	const endpoint = getConfig('@axium/ai').endpoints[endpointName];
	if (!endpoint) return;

	try {
		const capabilities = await getKnown();
		if (capabilities.has(id)) return;

		const signal = AbortSignal.timeout(10_000);
		const reasoningLevels = await getReasoningLevels(endpoint, model, signal);
		if (!reasoningLevels) return;

		const defaultReasoning = await getDefaultReasoning(endpoint, model, ['none', ...reasoningLevels], signal);

		await database
			.insertInto('ai_models')
			.values({ id, reasoningLevels, defaultReasoning, learned: new Date() })
			.onConflict(conflict => conflict.column('id').doUpdateSet({ reasoningLevels, defaultReasoning, learned: new Date() }))
			.execute();

		const learned = { id, reasoningLevels, defaultReasoning };
		capabilities.set(id, learned);
		socketServer?.to('web').emit('ai.model', learned);
	} catch (error) {
		io.debug(`AI: could not get capabilities of ${id}: ${io.errorText(error)}`);
	}
}

export async function getModels(): Promise<AIModels> {
	const config = getConfig('@axium/ai');

	const results = await Promise.allSettled(
		Object.entries(config.endpoints).map(async ([endpoint, settings]) => {
			const models = await listModels(settings, AbortSignal.timeout(5000));
			return models.map(
				model => ({ id: `${endpoint}/${model.id}`, endpoint, name: model.id, loaded: model.loaded }) satisfies AIModel
			);
		})
	);

	const models = results.flatMap(result => (result.status == 'fulfilled' ? result.value : []));

	await Promise.all(models.filter(model => model.loaded).map(model => learnCapabilities(model.id)));

	const capabilities = await getKnown();

	return {
		models: models.map(model => ({ ...model, ...capabilities.get(model.id) })),
		default: config.default_model,
	};
}
