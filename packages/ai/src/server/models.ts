import { database } from '@axium/server/database';
import { io as socketServer } from '@axium/server/socket';
import * as ai from '../common.js';
import * as llama from '../node/llama.js';
import * as models from '../node/models.js';

export async function getRows(): Promise<models.Registered[]> {
	return await database.selectFrom('ai_models').selectAll().orderBy('name').execute();
}

export async function getRow(id: string): Promise<models.Registered | undefined> {
	return await database.selectFrom('ai_models').selectAll().where('id', '=', id).executeTakeFirst();
}

export function emitModel(model: ai.Model): void {
	socketServer?.to('web').emit('ai.model', model);
}

export function emitRemoved(id: string): void {
	socketServer?.to('web').emit('ai.model.remove', id);
}

models.useRegistry({
	records: getRows,
	record: getRow,
	async saveCapabilities(id, capabilities) {
		return await database.updateTable('ai_models').set(capabilities).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
	},
	changed: emitModel,
});

export { get as getModel, getCapacity, learnCapabilities, syncPreset } from '../node/models.js';

export async function getRoles(): Promise<ai.Roles> {
	const rows = await database.selectFrom('ai_roles').selectAll().orderBy('position').execute();
	const roles = Object.fromEntries(ai.roles.map(role => [role, [] as string[]])) as ai.Roles;
	for (const row of rows) roles[row.role as ai.Role].push(row.modelId);
	return roles;
}

/** Replaces the model lists of the given roles */
export async function setRoles(update: ai.RolesUpdate): Promise<void> {
	await database.transaction().execute(async tx => {
		for (const role of ai.roles) {
			const list = update[role];
			if (!list) continue;
			await tx.deleteFrom('ai_roles').where('role', '=', role).execute();
			if (!list.length) continue;
			await tx
				.insertInto('ai_roles')
				.values(list.map((modelId, position) => ({ role, modelId, position })))
				.execute();
		}
	});
}

export async function getModels(): Promise<ai.Models> {
	const [list, roles] = await Promise.all([models.list(), getRoles()]);
	return { models: list, roles, memory: models.getMemory(), running: llama.isRunning() };
}

/** The ID of the model that currently serves a role */
export async function resolveRole(role: ai.Role): Promise<string | undefined> {
	const { models: list, roles } = await getModels();
	return ai.resolveRole(list, roles, role)?.id;
}
