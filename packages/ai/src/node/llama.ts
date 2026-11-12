import { getConfig } from '@axium/core';
import * as io from 'ioium';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type * as ai from '../common.js';

/** A model as llama-server's router lists it */
export interface RouterModel {
	id: string;
	source?: 'cache' | 'preset' | string;
	status: {
		value: 'unloaded' | 'loading' | 'loaded' | 'sleeping' | 'downloading' | 'incomplete';
		failed?: boolean;
		progress?: Record<string, { done: number; total: number }>;
	};
	architecture?: { input_modalities?: string[]; output_modalities?: string[] };
	/** Tokens; `null` when the model's files can't be read */
	context_length?: number | null;
	memory?: RouterMemory;
}

export interface RouterMemoryDevice {
	kind: 'device' | 'host';
	name: string;
	/** Bytes */
	model: number;
	/** Bytes */
	context: number;
	/** Bytes */
	compute: number;
	/** Bytes */
	total?: number;
	/** Bytes */
	free?: number;
}

export interface RouterMeasurement {
	n_ctx: number;
	devices: RouterMemoryDevice[];
}

export interface RouterMemory {
	status: 'unmeasured' | 'measuring' | 'measured' | 'failed';
	min?: RouterMeasurement;
	max?: RouterMeasurement;
	effective?: RouterMeasurement | null;
}

export interface RouterEvent {
	model: string;
	event: string;
	data?: any;
}

/** A model to put in the presets file */
export interface PresetModel {
	id: string;
	source: string;
	options: ai.ModelOptions;
}

/** Emits `event` with each {@link RouterEvent}, `ready` once llama-server answers, and `down` when it stops answering */
export const events = new EventEmitter<{ event: [RouterEvent]; ready: []; down: [] }>();

interface State {
	pid: number;
	fingerprint: string;
	key: string;
}

/** Where llama-server keeps its files and how it runs */
export interface Settings {
	data_dir: string;
	llama: ai.LlamaConfig;
}

let settings: () => Settings = () => getConfig('@axium/ai');

/** Uses settings other than the plugin's config, e.g. a device's own */
export function useSettings(source: () => Settings): void {
	settings = source;
}

let child: ChildProcess | undefined;
let state: State | undefined;
let failures = 0;
let restartTimer: NodeJS.Timeout | undefined;
let stopping = false;
let running = false;

export function isRunning(): boolean {
	return running;
}

function directory(): string {
	return settings().data_dir;
}

const statePath = () => join(directory(), 'llama-server.json');
const presetPath = () => join(directory(), 'models.ini');

function baseURL(): string {
	const { host, port } = settings().llama;
	return `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
}

function presetValue(value: string | number | boolean): string {
	return String(value).replace(/[\r\n]/g, ' ');
}

/** Writes the presets file llama-server loads models from */
export function writePreset(models: PresetModel[]): void {
	const { llama } = settings();

	const lines = ['version = 1', '', '[*]'];
	for (const [key, value] of Object.entries(llama.defaults)) lines.push(`${key} = ${presetValue(value)}`);
	lines.push('dedup-cache-models = true');

	for (const model of models) {
		lines.push('', `[${model.id}]`, `hf-repo = ${model.source}`);
		const { device, context, reserve, parallel } = model.options;
		if (device) lines.push(`device = ${device}`);
		if (context) lines.push(`ctx-size = ${context}`);
		if (reserve !== undefined) lines.push(`fit-target = ${reserve}`);
		if (parallel) lines.push(`parallel = ${parallel}`);
	}

	mkdirSync(directory(), { recursive: true });
	writeFileSync(presetPath(), lines.join('\n') + '\n');
}

function invocation() {
	const { llama, data_dir } = settings();

	const args = [
		'--models-preset',
		presetPath(),
		'--host',
		llama.host,
		'--port',
		String(llama.port),
		'--models-max',
		String(llama.models_max),
		'--models-memory-margin',
		String(llama.memory_margin),
	];

	const env: Record<string, string> = { LLAMA_CACHE: join(data_dir, 'models') };
	if (llama.hf_token) env.HF_TOKEN = llama.hf_token;

	const fingerprint = createHash('sha256')
		.update(JSON.stringify([llama.command, args, env]))
		.digest('base64url');

	return { command: llama.command, args, env, fingerprint };
}

function readState(): State | undefined {
	if (!existsSync(statePath())) return;
	try {
		return JSON.parse(readFileSync(statePath(), 'utf8'));
	} catch {
		return;
	}
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Whether `pid` is a llama-server process */
function isLlamaServer(pid: number, command: string): boolean {
	try {
		const [executable] = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
		return basename(executable) == basename(command);
	} catch {
		return false;
	}
}

async function terminate(pid: number): Promise<void> {
	try {
		process.kill(pid, 'SIGTERM');
	} catch {
		return;
	}

	for (let waited = 0; waited < 15_000; waited += 250) {
		if (!isAlive(pid)) return;
		await sleep(250);
	}

	try {
		process.kill(pid, 'SIGKILL');
	} catch {
		// Already gone
	}
}

function scheduleRestart(): void {
	if (stopping || restartTimer) return;
	const delay = Math.min(60_000, 1000 * 2 ** failures++);
	io.warn(`AI: restarting llama-server in ${delay / 1000}s`);
	restartTimer = setTimeout(() => {
		restartTimer = undefined;
		void start();
	}, delay);
}

function launch(command: string, args: string[], env: Record<string, string>, fingerprint: string): void {
	const key = randomBytes(24).toString('base64url');
	const log = openSync(join(directory(), 'llama-server.log'), 'w');

	const started = Date.now();
	const server = spawn(command, args, {
		env: { ...process.env, ...env, LLAMA_API_KEY: key },
		stdio: ['ignore', log, log],
	});
	closeSync(log);
	child = server;

	server.on('error', error => {
		io.error(`AI: could not run llama-server: ${io.errorText(error)}`);
		if ((error as NodeJS.ErrnoException).code != 'ENOENT') return;
		io.warn(`AI: not restarting llama-server until "${command}" is installed and the settings change`);
		stopping = true;
	});

	server.on('exit', (code, signal) => {
		if (child == server) child = undefined;
		if (stopping) return;
		if (Date.now() - started > 60_000) failures = 0;
		io.warn(`AI: llama-server exited (${signal ?? code})`);
		scheduleRestart();
	});

	if (!server.pid) return;
	state = { pid: server.pid, fingerprint, key };
	writeFileSync(statePath(), JSON.stringify(state), { mode: 0o600 });
}

/**
 * Starts llama-server, or keeps using one started by a previous Axium process with the same settings.
 * Models are listed from the presets file, so call {@link writePreset} first.
 */
export async function start(): Promise<void> {
	stopping = false;
	const { command, args, env, fingerprint } = invocation();
	mkdirSync(directory(), { recursive: true });

	const previous = readState();
	const reusable = previous && isAlive(previous.pid) && isLlamaServer(previous.pid, command);

	if (reusable && previous.fingerprint == fingerprint) {
		io.debug(`AI: using the running llama-server (${previous.pid})`);
		state = previous;
	} else {
		if (reusable) await terminate(previous.pid);
		io.debug('AI: starting llama-server');
		launch(command, args, env, fingerprint);
	}

	void watch();
}

/**
 * Uses a llama-server that another process supervises, e.g. the device daemon, without supervising it.
 * @returns whether one is running with the current settings
 */
export async function attach(): Promise<boolean> {
	const { command, fingerprint } = invocation();
	const previous = readState();
	if (!previous || previous.fingerprint != fingerprint || !isAlive(previous.pid) || !isLlamaServer(previous.pid, command)) return false;

	state = previous;
	try {
		await waitUntilHealthy(10_000);
	} catch {
		state = undefined;
		return false;
	}
	running = true;
	return true;
}

/** Stops llama-server, e.g. when its settings change */
export async function stop(): Promise<void> {
	stopping = true;
	clearTimeout(restartTimer);
	restartTimer = undefined;
	running = false;
	if (state) await terminate(state.pid);
	state = undefined;
	child = undefined;
}

/** Whether llama-server needs restarting to apply the current config */
export function settingsChanged(): boolean {
	return state?.fingerprint != invocation().fingerprint;
}

let watching = false;

/** Follows llama-server's events until it stops, restarting it if it was started elsewhere and died */
async function watch(): Promise<void> {
	if (watching) return;
	watching = true;

	try {
		while (!stopping && state) {
			try {
				await waitUntilHealthy();
				running = true;
				events.emit('ready');

				const response = await request('models/sse');
				for await (const event of serverSentEvents(response)) events.emit('event', event);
			} catch (error) {
				if (!stopping) io.debug(`AI: lost connection to llama-server: ${io.errorText(error)}`);
			}

			if (running) {
				running = false;
				events.emit('down');
			}

			if (stopping || !state) break;
			if (!child && !isAlive(state.pid)) {
				state = undefined;
				scheduleRestart();
				break;
			}
			await sleep(1000);
		}
	} finally {
		watching = false;
	}
}

/** @param timeout In milliseconds */
async function waitUntilHealthy(timeout = Infinity): Promise<void> {
	const deadline = Date.now() + timeout;
	for (;;) {
		if (stopping || !state) throw new Error('Stopped');
		if (Date.now() > deadline) throw new Error('llama-server did not become healthy in time');
		const healthy = await fetch(new URL('health', baseURL()), { signal: AbortSignal.timeout(2000) })
			.then(response => response.ok)
			.catch(() => false);
		if (healthy) return;
		if (!child && !isAlive(state.pid)) throw new Error('llama-server is not running');
		await sleep(500);
	}
}

/** Subscribes to router events, which are yielded as they happen until `signal` aborts */
export async function follow(signal?: AbortSignal): Promise<AsyncGenerator<RouterEvent>> {
	const response = await request('models/sse', { signal });
	return serverSentEvents(response);
}

export async function* serverSentEvents(response: Response): AsyncGenerator<any> {
	let buffer = '';
	for await (const chunk of response.body!.pipeThrough(new TextDecoderStream())) {
		buffer += chunk;
		const lines = buffer.split('\n');
		buffer = lines.pop()!;
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim();
			if (data == '[DONE]') return;
			yield JSON.parse(data);
		}
	}
}

/** Sends a request to llama-server, returning its response whether or not it succeeded */
export async function send(path: string, init: RequestInit = {}): Promise<Response> {
	if (!state) throw new Error('llama-server is not running');

	const headers = new Headers(init.headers);
	headers.set('Authorization', 'Bearer ' + state.key);
	if (init.body) headers.set('Content-Type', 'application/json');

	return await fetch(new URL(path, baseURL()), { ...init, headers });
}

/** Sends a request to llama-server, throwing its error message on failure */
export async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const response = await send(path, init);
	if (response.ok) return response;

	const body = await response.text();
	let message = body;
	try {
		message = JSON.parse(body).error?.message ?? body;
	} catch {
		// Not JSON
	}
	throw new Error(`llama-server: ${message || response.statusText}`);
}

async function post(path: string, body: object): Promise<void> {
	await request(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function listModels(reload = false): Promise<RouterModel[]> {
	const response = await request('models' + (reload ? '?reload=1' : ''), { signal: AbortSignal.timeout(10_000) });
	const { data } = (await response.json()) as { data: RouterModel[] };
	return data;
}

/** Makes llama-server read the presets file again */
export async function reload(): Promise<void> {
	if (running) await listModels(true);
}

export const load = (model: string) => post('models/load', { model });
export const unload = (model: string) => post('models/unload', { model });

/** Starts downloading `<repository>:<quantization>` into the cache, or resumes a paused download */
export const download = (source: string) => post('models', { model: source });

/** Deletes a cached model's files, or a paused download's partial files */
export async function remove(source: string): Promise<void> {
	await request('models?model=' + encodeURIComponent(source), { method: 'DELETE' });
}

/**
 * What a loaded model's chat template supports.
 * Only available while the model is loaded; this never loads it.
 */
export async function getTemplateCaps(model: string, signal?: AbortSignal): Promise<TemplateCaps | undefined> {
	const response = await request(`props?model=${encodeURIComponent(model)}&autoload=false`, { signal }).catch(() => null);
	if (!response) return;

	const props = (await response.json()) as { chat_template_caps?: TemplateCaps | null };
	return props.chat_template_caps ?? undefined;
}

export interface TemplateCaps {
	/** Lowest to highest */
	reasoning_effort_levels?: string[];
	supports_tool_calls?: boolean;
}

/** The prompt a loaded model would see, without running it */
async function renderPrompt(model: string, reasoning?: string, signal?: AbortSignal): Promise<string | undefined> {
	const response = await request('apply-template?autoload=false', {
		method: 'POST',
		signal,
		body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }], reasoning_effort: reasoning }),
	}).catch(() => null);
	if (!response) return;

	const { prompt } = (await response.json()) as { prompt?: string };
	return prompt;
}

/** Which of `candidates` a loaded model's chat template uses when no reasoning effort is given, found by comparing rendered prompts */
export async function getTemplateReasoning(model: string, candidates: string[], signal?: AbortSignal): Promise<string | undefined> {
	const base = await renderPrompt(model, undefined, signal);
	if (base === undefined) return;

	for (const candidate of candidates) {
		if ((await renderPrompt(model, candidate, signal)) === base) return candidate;
	}
}
