import { database, type Schema } from '@axium/server/database';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium';
import type { Selectable } from 'kysely';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import * as ai from '../common.js';
import * as llama from '../node/llama.js';

type ModelRow = Selectable<Schema['ai_models']>;

/** The router's models from its last listing, by router name */
let listed = new Map<string, llama.RouterModel>();

/** Downloads in progress, by source */
const downloads = new Map<string, ai.DownloadProgress>();

async function refresh(): Promise<Map<string, llama.RouterModel>> {
	if (!llama.isRunning()) return (listed = new Map());
	try {
		listed = new Map((await llama.listModels()).map(model => [model.id, model]));
	} catch (error) {
		io.debug(`AI: could not list models: ${io.errorText(error)}`);
	}
	return listed;
}

function sumUse(measurement?: llama.RouterMeasurement | null): ai.MemoryUse | undefined {
	if (!measurement) return;
	const use: ai.MemoryUse = { device: 0, host: 0 };
	for (const device of measurement.devices) use[device.kind] += device.model + device.context + device.compute;
	return use;
}

function measuredMemory(...models: (llama.RouterModel | undefined)[]): llama.RouterMemory | undefined {
	return models.find(model => model?.memory?.status == 'measured')?.memory ?? models.find(model => model?.memory)?.memory;
}

function knownModalities(modalities?: string[]): ai.Modality[] | undefined {
	return modalities?.filter((modality): modality is ai.Modality => {
		if (ai.Modality.safeParse(modality).success) return true;
		io.warnOnce(`AI: ignoring unknown modality "${modality}" reported by llama-server`);
		return false;
	});
}

function toModel(row: ModelRow): ai.Model {
	const preset = listed.get(row.id);
	const cached = listed.get(row.source);
	const memory = measuredMemory(preset, cached);

	let status: ai.ModelStatus;
	let progress = downloads.get(row.source);

	const cachedStatus = cached?.status.value;
	if (progress || cachedStatus == 'downloading' || cachedStatus == 'incomplete') {
		status = cachedStatus == 'incomplete' ? 'incomplete' : 'downloading';
		if (!progress && cached?.status.progress) {
			progress = { done: 0, total: 0 };
			for (const file of Object.values(cached.status.progress)) {
				progress.done += file.done;
				progress.total += file.total;
			}
		}
	} else if (!preset?.context_length) {
		status = 'unavailable';
	} else {
		status = preset.status.value;
	}

	return {
		id: row.id,
		name: row.name,
		source: row.source,
		size: row.size,
		created: row.created,
		status,
		failed: preset?.status.failed || undefined,
		progress,
		contextLength: preset?.context_length ?? undefined,
		inputs: knownModalities(preset?.architecture?.input_modalities),
		outputs: knownModalities(preset?.architecture?.output_modalities),
		memory: memory && {
			minimum: sumUse(memory.min),
			current: status == 'loaded' ? sumUse(memory.effective) : undefined,
			context: status == 'loaded' ? memory.effective?.n_ctx : undefined,
		},
		reasoningLevels: row.reasoningLevels ?? undefined,
		templateReasoning: row.templateReasoning ?? undefined,
		tools: row.tools ?? undefined,
		reasoning: row.reasoning,
		systemPrompt: row.systemPrompt,
		options: row.options,
	};
}

export async function getRows(): Promise<ModelRow[]> {
	return await database.selectFrom('ai_models').selectAll().orderBy('name').execute();
}

export async function getRow(id: string): Promise<ModelRow | undefined> {
	return await database.selectFrom('ai_models').selectAll().where('id', '=', id).executeTakeFirst();
}

/** Writes the presets file from the database and makes llama-server read it */
export async function syncPreset(): Promise<void> {
	const rows = await getRows();
	llama.writePreset(rows.map(row => ({ id: row.id, source: row.source, options: row.options })));
	await llama.reload();
}

/** AMD GPUs report memory use through sysfs, in card order */
function gpuUse(): { total: number; used: number }[] {
	const gpus = [];
	try {
		for (const card of readdirSync('/sys/class/drm').filter(name => /^card\d+$/.test(name))) {
			const device = join('/sys/class/drm', card, 'device');
			if (!existsSync(join(device, 'mem_info_vram_total'))) continue;
			gpus.push({
				index: Number(card.slice(4)),
				total: Number(readFileSync(join(device, 'mem_info_vram_total'), 'utf8')),
				used: Number(readFileSync(join(device, 'mem_info_vram_used'), 'utf8')),
			});
		}
	} catch {
		return [];
	}
	return gpus.sort((a, b) => a.index - b.index);
}

function getMemory(): ai.DRAM {
	const byIndex = new Map<number, { names: Set<string>; total: number; free?: number }>();

	for (const model of listed.values()) {
		for (const measurement of [model.memory?.min, model.memory?.effective]) {
			for (const device of measurement?.devices ?? []) {
				if (device.kind != 'device' || !device.total) continue;
				const index = Number(/\d+$/.exec(device.name)?.[0] ?? 0);
				const entry = byIndex.get(index) ?? { names: new Set(), total: device.total };
				entry.names.add(device.name);
				entry.total = Math.max(entry.total, device.total);
				entry.free = device.free ?? entry.free;
				byIndex.set(index, entry);
			}
		}
	}

	const gpus = gpuUse();
	const devices: ai.Device[] = [...byIndex.entries()]
		.sort(([a], [b]) => a - b)
		.map(([index, { names, total, free }]) => ({
			name: [...names].sort().join(' / '),
			total: gpus[index]?.total ?? total,
			used: gpus[index]?.used ?? (free === undefined ? undefined : total - free),
		}));

	if (!devices.length) {
		for (const [index, gpu] of gpus.entries()) devices.push({ name: 'GPU ' + index, total: gpu.total, used: gpu.used });
	}

	return { devices, host: { name: 'RAM', total: totalmem(), used: totalmem() - freemem() } };
}

/** Memory model weights could use, in bytes */
export function getCapacity(): { device: number; host: number } {
	const memory = getMemory();
	return {
		device: memory.devices.reduce((sum, device) => sum + device.total, 0),
		host: memory.host.total - (memory.host.used ?? 0),
	};
}

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
			const models = update[role];
			if (!models) continue;
			await tx.deleteFrom('ai_roles').where('role', '=', role).execute();
			if (!models.length) continue;
			await tx
				.insertInto('ai_roles')
				.values(models.map((modelId, position) => ({ role, modelId, position })))
				.execute();
		}
	});
}

export async function getModels(): Promise<ai.Models> {
	const [rows, roles] = await Promise.all([getRows(), getRoles(), refresh()]);
	return {
		models: rows.map(toModel),
		roles,
		memory: getMemory(),
		running: llama.isRunning(),
	};
}

/** The ID of the model that currently serves a role */
export async function resolveRole(role: ai.Role): Promise<string | undefined> {
	const { models, roles } = await getModels();
	return ai.resolveRole(models, roles, role)?.id;
}

export async function getModel(id: string): Promise<ai.Model | undefined> {
	const [row] = await Promise.all([getRow(id), refresh()]);
	return row && toModel(row);
}

export function emitModel(model: ai.Model): void {
	socketServer?.to('web').emit('ai.model', model);
}

export function emitRemoved(id: string): void {
	socketServer?.to('web').emit('ai.model.remove', id);
}

/** Sends the current state of the models a router name refers to, or of every model */
async function emitFor(name?: string): Promise<void> {
	const rows = await getRows();
	for (const row of rows) {
		if (!name || row.id == name || row.source == name) emitModel(toModel(row));
	}
}

const learning = new Set<string>();

/** Records what a model supports, unless already known. The model must be loaded for llama-server to report anything. */
export async function learnCapabilities(id: string): Promise<void> {
	if (learning.has(id)) return;
	learning.add(id);

	try {
		const row = await getRow(id);
		if (!row || row.learned) return;

		const signal = AbortSignal.timeout(10_000);
		const caps = await llama.getTemplateCaps(id, signal);
		const reasoningLevels = caps?.reasoning_effort_levels;
		if (!caps || !reasoningLevels) return;

		const templateReasoning = await llama.getTemplateReasoning(id, ['none', ...reasoningLevels], signal);

		const updated = await database
			.updateTable('ai_models')
			.set({ reasoningLevels, templateReasoning, tools: caps.supports_tool_calls ?? null, learned: new Date() })
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow();

		emitModel(toModel(updated));
	} catch (error) {
		io.debug(`AI: could not get capabilities of ${id}: ${io.errorText(error)}`);
	} finally {
		learning.delete(id);
	}
}

const lastProgress = new Map<string, number>();

/** Whether a progress update for `name` arrived too soon after the last one to be worth sending */
function throttled(name: string): boolean {
	const now = Date.now();
	if (now - (lastProgress.get(name) ?? 0) < 500) return true;
	lastProgress.set(name, now);
	return false;
}

async function handleEvent({ model: name, event, data }: llama.RouterEvent): Promise<void> {
	switch (event) {
		case 'download_progress': {
			const progress: ai.DownloadProgress = { done: 0, total: 0 };
			for (const file of Object.values(data as Record<string, ai.DownloadProgress>)) {
				progress.done += file.done;
				progress.total += file.total;
			}
			downloads.set(name, progress);
			if (throttled(name)) return;
			break;
		}
		case 'download_finished':
		case 'download_failed':
			downloads.delete(name);
			lastProgress.delete(name);
			if (event == 'download_failed') io.warn(`AI: download of ${name} failed: ${JSON.stringify(data ?? {})}`);
			await llama.reload().catch(() => {});
			break;
		case 'model_status':
		case 'status_change':
			if (data?.status == 'loading') {
				if (data.progress && throttled(name)) return;
				break;
			}
			lastProgress.delete(name);
			if (data?.status == 'loaded') {
				for (const row of await getRows()) {
					if (row.id == name || row.source == name) void learnCapabilities(row.id);
				}
			}
			break;
	}

	await refresh();
	await emitFor(name == '*' ? undefined : name);
}

llama.events.on('event', event => {
	void handleEvent(event).catch(error => io.debug(`AI: could not handle ${event.event}: ${io.errorText(error)}`));
});

async function handleReady(): Promise<void> {
	await refresh();
	for (const row of await getRows()) {
		const model = toModel(row);
		if (model.status == 'loaded') void learnCapabilities(row.id);
		emitModel(model);
	}
}

llama.events.on('ready', () => {
	void handleReady().catch(error => io.debug(`AI: could not refresh models: ${io.errorText(error)}`));
});

llama.events.on('down', () => {
	listed = new Map();
	void emitFor().catch(() => {});
});
