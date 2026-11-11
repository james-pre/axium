import { getConfig } from '@axium/core';
import type * as ai from '../common.js';
import { getCapacity } from './models.js';

const hubURL = 'https://huggingface.co/';

async function hubFetch<T>(path: string): Promise<T> {
	const { hf_token } = getConfig('@axium/ai').llama;
	const response = await fetch(new URL(path, hubURL), {
		headers: hf_token ? { Authorization: 'Bearer ' + hf_token } : {},
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) throw new Error(`Hugging Face: ${response.status} ${response.statusText}`);
	return (await response.json()) as T;
}

export async function search(query: string): Promise<ai.HubRepo[]> {
	const params = new URLSearchParams({ search: query, filter: 'gguf', sort: 'downloads', direction: '-1', limit: '30' });
	for (const field of ['downloads', 'likes', 'lastModified']) params.append('expand[]', field);

	const results = await hubFetch<{ id: string; downloads?: number; likes?: number; lastModified?: string }[]>(
		'api/models?' + params.toString()
	);

	return results.map(result => ({
		id: result.id,
		downloads: result.downloads ?? 0,
		likes: result.likes ?? 0,
		modified: result.lastModified ? new Date(result.lastModified) : undefined,
	}));
}

const sidecarNames = ['mmproj', 'mtp', 'dflash', 'eagle3', 'dspark'];

/** The quantization tag llama.cpp reads from a GGUF file name, and the name shared by the shards of a split file */
function parseFileName(path: string): { prefix: string; tag?: string } {
	const prefix = path.slice(0, -'.gguf'.length).replace(/-\d{5}-of-\d{5}$/i, '');
	const tag = /[-.]([A-Z0-9_]+)$/i.exec(prefix)?.[1].toUpperCase();
	return { prefix, tag };
}

function isModelFile(path: string): boolean {
	const name = path.toLowerCase().split('/').at(-1)!;
	return !name.includes('imatrix') && !sidecarNames.some(sidecar => name.includes(sidecar));
}

function fitOf(size: bigint): ai.Fit {
	const capacity = getCapacity();
	const needed = Number(size) * 1.15;
	if (needed <= capacity.device) return 'device';
	if (needed <= capacity.device + capacity.host) return 'host';
	return 'none';
}

export async function details(repo: string): Promise<ai.HubDetails> {
	const [info, tree] = await Promise.all([
		hubFetch<{ id: string; baseModels?: { relation?: string; models?: { id: string }[] } }>(`api/models/${repo}?expand[]=baseModels`),
		hubFetch<{ type: string; path: string; size: number; lfs?: { size: number } }[]>(`api/models/${repo}/tree/main?recursive=true`),
	]);

	const files = tree.filter(entry => entry.type == 'file' && entry.path.toLowerCase().endsWith('.gguf'));

	const projectors = files.filter(file => file.path.toLowerCase().includes('mmproj'));
	const projectorSize = projectors.length ? Math.min(...projectors.map(file => file.lfs?.size ?? file.size)) : 0;

	const quants = new Map<string, ai.HubQuant & { prefix: string }>();

	for (const file of files) {
		if (!isModelFile(file.path)) continue;
		const parsed = parseFileName(file.path);
		if (!parsed.tag) continue;

		const existing = quants.get(parsed.tag);
		if (existing && existing.prefix != parsed.prefix) continue;

		const quant = existing ?? { tag: parsed.tag, prefix: parsed.prefix, files: [], size: BigInt(projectorSize), fit: 'none' as ai.Fit };
		quant.files.push(file.path);
		quant.size += BigInt(file.lfs?.size ?? file.size);
		quants.set(parsed.tag, quant);
	}

	const base = info.baseModels?.relation == 'quantized' ? info.baseModels.models?.[0]?.id : undefined;

	return {
		repo: info.id,
		base,
		quants: [...quants.values()]
			.map(({ prefix: _, ...quant }) => ({ ...quant, fit: fitOf(quant.size) }))
			.sort((a, b) => Number(a.size - b.size)),
	};
}
