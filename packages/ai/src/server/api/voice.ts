import { getConfig } from '@axium/core';
import type { AsyncResult } from '@axium/core/api';
import features from '@axium/core/features';
import { requireSession } from '@axium/server/auth';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as ai from '../../common.js';
import * as llama from '../../node/llama.js';
import { speakable } from '../../speech.js';
import { getModels, resolveRole } from '../models.js';

/** The most audio accepted for transcription, in bytes */
const maxAudioSize = 32 * 1024 * 1024;

async function requireVoiceEnabled(request: Request): Promise<void> {
	await requireSession(request);
	if (!features('ai-voice')) error(403, 'Voice is disabled');
	if (!llama.isRunning()) error(503, 'llama-server is not running');
}

async function requireVoice(request: Request, role: 'stt' | 'tts'): Promise<string> {
	await requireVoiceEnabled(request);
	return (await resolveRole(role)) ?? error(503, `No ${role == 'stt' ? 'speech-to-text' : 'text-to-speech'} model is available`);
}

/** llama-server's error message, or its status when it didn't give one */
async function upstreamError(response: Response): Promise<string> {
	const body = await response.text();
	try {
		return JSON.parse(body).error?.message ?? body;
	} catch {
		return body || response.statusText;
	}
}

let reference: { path: string; modified: number; data: string } | undefined;

/** Keeps a voice the same between requests, which models without a speaker reference pick at random */
const seed = 1;

const defaultVoiceText = 'Hello. I am your assistant, and this is the voice I will use when I speak to you.';

let generating: Promise<void> | undefined;

/** Makes the voice used when no speaker reference is configured, once */
async function generateDefaultVoice(path: string, model: string): Promise<void> {
	const response = await llama.send('v1/audio/speech', {
		method: 'POST',
		body: JSON.stringify({ model, input: defaultVoiceText, response_format: 'wav', seed }),
	});
	if (!response.ok) throw new Error(await upstreamError(response));

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

/**
 * The recording every reply imitates, in base64: the configured one, or a default voice made the first time it's needed.
 * Without one, each request may get a different voice.
 */
async function speakerReference(model: string): Promise<string> {
	const configured = getConfig('@axium/ai').speaker_reference;
	const path = configured ?? join(getConfig('@axium/ai').data_dir, 'default-voice.wav');

	if (!configured && !existsSync(path)) {
		generating ??= generateDefaultVoice(path, model).finally(() => (generating = undefined));
		await generating;
	}

	const { mtimeMs: modified } = await stat(path);
	if (reference?.path != path || reference.modified != modified) {
		reference = { path, modified, data: (await readFile(path)).toString('base64') };
	}
	return reference.data;
}

addRoute({
	path: '/api/ai/transcription',
	/** Takes a WAV or MP3 recording as the body */
	async POST(request): Promise<ai.Transcription> {
		const model = await requireVoice(request, 'stt');

		const audio = await request.blob();
		if (!audio.size) error(400, 'Missing audio');
		if (audio.size > maxAudioSize) error(413, 'The recording is too large');

		const form = new FormData();
		form.set('model', model);
		form.set('file', audio, audio.type.includes('mpeg') ? 'audio.mp3' : 'audio.wav');

		const upstream = await llama
			.send('v1/audio/transcriptions', { method: 'POST', body: form, signal: request.signal })
			.catch(withError('Could not reach llama-server', 502));
		if (!upstream.ok) error(502, 'Could not transcribe: ' + (await upstreamError(upstream)));

		const { text } = (await upstream.json()) as { text?: string };
		return { text: text?.trim() ?? '' };
	},
});

addRoute({
	path: '/api/ai/speech',
	/** Responds with WAV audio */
	async POST(request): Promise<Response> {
		const { text } = await parseBody(request, ai.SpeechInit);
		const model = await requireVoice(request, 'tts');

		const input = speakable(text);
		if (!/[\p{L}\p{N}]/u.test(input)) error(400, 'Nothing in the text can be spoken');

		const speaker = await speakerReference(model).catch(withError('Could not get the voice to speak with', 502));

		const speech = (speaker_ref_b64?: string) =>
			llama
				.send('v1/audio/speech', {
					method: 'POST',
					body: JSON.stringify({ model, input, response_format: 'wav', seed, speaker_ref_b64 }),
					signal: request.signal,
				})
				.catch(withError('Could not reach llama-server', 502));

		let upstream = await speech(speaker);
		const referenceRejected = upstream.status == 400;
		if (referenceRejected) upstream = await speech();
		if (!upstream.ok) error(502, 'Could not speak: ' + (await upstreamError(upstream)));

		return new Response(upstream.body, { headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/wav' } });
	},
});

addRoute({
	path: '/api/ai/voice/prepare',
	async POST(request): AsyncResult<'POST', 'ai/voice/prepare'> {
		await requireVoiceEnabled(request);

		const { models, roles } = await getModels();
		const stt = ai.resolveRole(models, roles, 'stt');
		const tts = ai.resolveRole(models, roles, 'tts');

		for (const model of new Set([stt, tts])) {
			if (!model || model.status == 'loaded' || model.status == 'loading') continue;
			await llama.load(model.id).catch(withError(`Could not load ${model.name}`, 502));
		}

		if (tts) await speakerReference(tts.id).catch(withError('Could not get the voice to speak with', 502));
		return {};
	},
});
