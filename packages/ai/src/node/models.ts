import * as io from 'ioium';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import * as ai from '../common.js';
import * as llama from './llama.js';

/** A model as it is saved, e.g. in the database on servers or the config file on devices */
export interface Registered extends ai.ModelInfo {
	/** When the capabilities above were learned */
	learned: Date | null;
}

export type Capabilities = Pick<Registered, 'reasoningLevels' | 'templateReasoning' | 'tools' | 'learned'>;

/** Where models are saved */
export interface Registry {
	/** Sorted by name */
	records(): Promise<Registered[]>;
	record(id: string): Promise<Registered | undefined>;
	saveCapabilities(id: string, capabilities: Capabilities): Promise<Registered>;
	/** Called when a model's state changes */
	changed?(model: ai.Model): void;
}

let registry: Registry | undefined;

/** Sets where models are saved; required before models change state */
export function useRegistry(source: Registry): void {
	registry = source;
}

function requireRegistry(): Registry {
	if (!registry) throw new Error('No model registry is in use');
	return registry;
}

/** The router's models from its last listing, by router name */
let listed = new Map<string, llama.RouterModel>();

/** Downloads in progress, by source */
const downloads = new Map<string, ai.DownloadProgress>();

export async function refresh(): Promise<void> {
	if (!llama.isRunning()) {
		listed = new Map();
		return;
	}
	try {
		listed = new Map((await llama.listModels()).map(model => [model.id, model]));
	} catch (error) {
		io.debug('AI: could not list models:', io.errorText(error));
	}
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

/** A saved model with its state from llama-server's last listing */
export function toModel(record: Registered): ai.Model {
	const preset = listed.get(record.id);
	const cached = listed.get(record.source);
	const memory = measuredMemory(preset, cached);

	let status: ai.ModelStatus;
	let progress = downloads.get(record.source);

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
		id: record.id,
		name: record.name,
		source: record.source,
		size: record.size,
		created: record.created,
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
		reasoningLevels: record.reasoningLevels ?? undefined,
		templateReasoning: record.templateReasoning ?? undefined,
		tools: record.tools ?? undefined,
		reasoning: record.reasoning,
		systemPrompt: record.systemPrompt,
		options: record.options,
	};
}

/** Every saved model with its current state */
export async function list(): Promise<ai.Model[]> {
	const [records] = await Promise.all([requireRegistry().records(), refresh()]);
	return records.map(toModel);
}

export async function get(id: string): Promise<ai.Model | undefined> {
	const [record] = await Promise.all([requireRegistry().record(id), refresh()]);
	return record && toModel(record);
}

/** Writes the presets file from the saved models and makes llama-server read it */
export async function syncPreset(): Promise<void> {
	const records = await requireRegistry().records();
	llama.writePreset(records.map(record => ({ id: record.id, source: record.source, options: record.options })));
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

export function getMemory(): ai.DRAM {
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
export function getCapacity(): ai.MemoryUse {
	const memory = getMemory();
	return {
		device: memory.devices.reduce((sum, device) => sum + device.total, 0),
		host: memory.host.total - (memory.host.used ?? 0),
	};
}

const learning = new Set<string>();

/** Records what a model supports, unless already known. The model must be loaded for llama-server to report anything. */
export async function learnCapabilities(id: string): Promise<void> {
	if (learning.has(id) || !registry) return;
	learning.add(id);

	try {
		const record = await registry.record(id);
		if (!record || record.learned) return;

		const signal = AbortSignal.timeout(10_000);
		const caps = await llama.getTemplateCaps(id, signal);
		const reasoningLevels = caps?.reasoning_effort_levels;
		if (!caps || !reasoningLevels) return;

		const templateReasoning = (await llama.getTemplateReasoning(id, ['none', ...reasoningLevels], signal)) ?? null;

		const updated = await registry.saveCapabilities(id, {
			reasoningLevels,
			templateReasoning,
			tools: caps.supports_tool_calls ?? null,
			learned: new Date(),
		});

		registry.changed?.(toModel(updated));
	} catch (error) {
		io.debug(`AI: could not get capabilities of ${id}: ${io.errorText(error)}`);
	} finally {
		learning.delete(id);
	}
}

/** Reports the current state of the models a router name refers to, or of every model */
async function reportChanges(name?: string): Promise<void> {
	if (!registry?.changed) return;
	for (const record of await registry.records()) {
		if (!name || record.id == name || record.source == name) registry.changed(toModel(record));
	}
}

const lastProgress = new Map<string, number>();

/** Whether a progress update for `name` arrived too soon after the last one to be worth reporting */
function throttled(name: string): boolean {
	const now = Date.now();
	if (now - (lastProgress.get(name) ?? 0) < 500) return true;
	lastProgress.set(name, now);
	return false;
}

/** Tracks downloads from a router event, returning whether models' states changed in a way worth reporting */
export function track({ model: name, event, data }: llama.RouterEvent): boolean {
	switch (event) {
		case 'download_progress': {
			const progress: ai.DownloadProgress = { done: 0, total: 0 };
			for (const file of Object.values(data as Record<string, ai.DownloadProgress>)) {
				progress.done += file.done;
				progress.total += file.total;
			}
			downloads.set(name, progress);
			return !throttled(name);
		}
		case 'download_finished':
		case 'download_failed':
			downloads.delete(name);
			lastProgress.delete(name);
			return true;
		case 'model_status':
		case 'status_change':
			if (data?.status == 'loading') return !(data.progress && throttled(name));
			lastProgress.delete(name);
			return true;
		default:
			return true;
	}
}

async function handleEvent(event: llama.RouterEvent): Promise<void> {
	if (!track(event)) return;

	const { model: name, event: type, data } = event;
	if (type == 'download_failed') io.warn(`AI: download of ${name} failed: ${JSON.stringify(data ?? {})}`);
	if (type == 'download_finished' || type == 'download_failed') await llama.reload().catch(() => {});

	if ((type == 'model_status' || type == 'status_change') && data?.status == 'loaded' && registry) {
		for (const record of await registry.records()) {
			if (record.id == name || record.source == name) void learnCapabilities(record.id);
		}
	}

	await refresh();
	await reportChanges(name == '*' ? undefined : name);
}

llama.events.on('event', event => {
	void handleEvent(event).catch(error => io.debug(`AI: could not handle ${event.event}: ${io.errorText(error)}`));
});

async function handleReady(): Promise<void> {
	if (!registry) return;
	await refresh();
	for (const record of await registry.records()) {
		const model = toModel(record);
		if (model.status == 'loaded') void learnCapabilities(record.id);
		registry.changed?.(model);
	}
}

llama.events.on('ready', () => {
	void handleReady().catch(error => io.debug('AI: could not refresh models:', io.errorText(error)));
});

llama.events.on('down', () => {
	listed = new Map();
	void reportChanges().catch(() => {});
});
