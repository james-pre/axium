import type { AsyncResult } from '@axium/core/api';
import { requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, parseBody, parseSearch, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as io from 'ioium';
import * as z from 'zod';
import * as ai from '../../common.js';
import * as hub from '../../hub.js';
import * as llama from '../../node/llama.js';
import { emitModel, emitRemoved, getCapacity, getModel, getModels, getRoles, getRow, getRows, setRoles, syncPreset } from '../models.js';

async function requireAdmin(request: Request): Promise<void> {
	const session = await requireSession(request);
	if (!session.user.isAdmin) error(403, 'Only administrators can manage models');
}

function requireRunning(): void {
	if (!llama.isRunning()) error(503, 'llama-server is not running');
}

async function existingModel(id: string) {
	const model = await getModel(id);
	if (!model) error(404, 'Model not found');
	return model;
}

addRoute({
	path: '/api/ai/models',
	async GET(request): AsyncResult<'GET', 'ai/models'> {
		await requireSession(request);
		return await getModels();
	},
	async PUT(request): AsyncResult<'PUT', 'ai/models'> {
		const init = await parseBody(request, ai.ModelInit);
		await requireAdmin(request);
		requireRunning();

		if (await getRow(init.id)) error(409, 'A model with this ID already exists');

		const details = await hub.details(init.repo, getCapacity()).catch(withError('Could not get the repository from Hugging Face', 502));
		const quant = details.quants.find(quant => quant.tag == init.quant);
		if (!quant) error(400, 'The repository has no such quantization');

		const source = `${details.repo}:${quant.tag}`;

		await database
			.insertInto('ai_models')
			.values({ id: init.id, name: init.name, source, size: quant.size, options: JSON.stringify(init.options ?? {}) })
			.execute()
			.catch(withError('Could not save the model'));

		try {
			await syncPreset();
			await llama.download(source);
		} catch (cause) {
			await database.deleteFrom('ai_models').where('id', '=', init.id).execute();
			await syncPreset().catch(() => {});
			error(502, io.errorText(cause));
		}

		const model = await existingModel(init.id);
		emitModel(model);
		return model;
	},
});

addRoute({
	path: '/api/ai/models/:id',
	params: { id: ai.ModelId },
	async GET(request, { id }): AsyncResult<'GET', 'ai/models/:id'> {
		await requireSession(request);
		return await existingModel(id);
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'ai/models/:id'> {
		const { options, ...update } = await parseBody(request, ai.ModelUpdate);
		await requireAdmin(request);
		await existingModel(id);

		await database
			.updateTable('ai_models')
			.set({ ...update, ...(options && { options: JSON.stringify(options) }) })
			.where('id', '=', id)
			.execute()
			.catch(withError('Could not update the model'));

		if (options) await syncPreset().catch(withError('Could not apply the new options', 502));

		const model = await existingModel(id);
		emitModel(model);
		return model;
	},
	async POST(request, { id }): AsyncResult<'POST', 'ai/models/:id'> {
		const { action } = await parseBody(request, ai.ModelAction);
		await requireAdmin(request);
		const { source } = await existingModel(id);
		requireRunning();

		const actions = {
			load: () => llama.load(id),
			unload: () => llama.unload(id),
			pause: () => llama.unload(source),
			resume: () => llama.download(source),
		};

		await actions[action]().catch(withError(`Could not ${action} the model`, 502));

		const model = await existingModel(id);
		emitModel(model);
		return model;
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'ai/models/:id'> {
		await requireAdmin(request);
		const model = await existingModel(id);
		requireRunning();

		if (model.status == 'loaded' || model.status == 'loading' || model.status == 'sleeping') {
			await llama.unload(id).catch(withError('Could not unload the model', 502));
		}

		const shared = (await getRows()).some(row => row.id != id && row.source == model.source);
		if (!shared) {
			await llama.remove(model.source).catch(cause => {
				if (model.status != 'unavailable') error(502, 'Could not delete the model files: ' + io.errorText(cause));
			});
		}

		await database.deleteFrom('ai_models').where('id', '=', id).execute().catch(withError('Could not delete the model'));
		await syncPreset().catch(cause => io.warn(`AI: could not update llama-server's models: ${io.errorText(cause)}`));

		emitRemoved(id);
		return model;
	},
});

addRoute({
	path: '/api/ai/roles',
	async GET(request): AsyncResult<'GET', 'ai/roles'> {
		await requireSession(request);
		return await getRoles();
	},
	async PATCH(request): AsyncResult<'PATCH', 'ai/roles'> {
		const update = await parseBody(request, ai.RolesUpdate);
		await requireAdmin(request);

		const known = new Set((await getRows()).map(row => row.id));
		for (const models of Object.values(update)) {
			if (new Set(models).size != models.length) error(400, 'A model is listed twice for the same role');
			const unknown = models.find(id => !known.has(id));
			if (unknown) error(404, `Model "${unknown}" not found`);
		}

		await setRoles(update).catch(withError('Could not update the roles'));
		return await getRoles();
	},
});

addRoute({
	path: '/api/ai/hub',
	async GET(request): AsyncResult<'GET', 'ai/hub'> {
		const { search } = parseSearch(request, ai.HubSearch);
		await requireAdmin(request);
		return await hub.search(search).catch(withError('Could not search Hugging Face', 502));
	},
});

addRoute({
	path: '/api/ai/hub/details',
	async GET(request): AsyncResult<'GET', 'ai/hub/details'> {
		const { repo } = parseSearch(request, z.object({ repo: ai.HubRepoId }));
		await requireAdmin(request);
		return await hub.details(repo, getCapacity()).catch(withError('Could not get the repository from Hugging Face', 502));
	},
});
