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

/** Makes speech reproducible, including the generated default voice */
const seed = 1;

/** How long the end of each clip fades out, in seconds */
const fadeLength = 0.04;

/** The pause after each clip, in seconds */
const pauseLength = 0.25;

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

interface SpeakerReference {
	/** WAV, in base64 */
	audio: string;
	/** The transcript of the audio */
	text?: string;
}

const defaultVoiceText = 'Hello. I am your assistant, and this is the voice I will use when I speak to you.';

let generating: Promise<void> | undefined;

async function generateDefaultVoice(path: string, model: string): Promise<void> {
	const response = await llama.send('v1/audio/speech', {
		method: 'POST',
		body: JSON.stringify({ model, input: defaultVoiceText, response_format: 'wav', seed }),
	});
	if (!response.ok) throw new Error(await upstreamError(response));

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, await response.bytes());
}

let cached: { path: string; modified: number; audio: string } | undefined;

/** The recording every reply imitates: the configured one, or a default voice made the first time it's needed */
async function speakerReference(model: string): Promise<SpeakerReference> {
	const { speaker_reference: configured, speaker_reference_text, data_dir } = getConfig('@axium/ai');
	const path = configured ?? join(data_dir, 'default-voice.wav');

	if (!configured && !existsSync(path)) {
		generating ??= generateDefaultVoice(path, model).finally(() => (generating = undefined));
		await generating;
	}

	const { mtimeMs: modified } = await stat(path);
	if (cached?.path != path || cached.modified != modified) {
		cached = { path, modified, audio: (await readFile(path)).toString('base64') };
	}

	return { audio: cached.audio, text: (configured ? speaker_reference_text : defaultVoiceText) ?? undefined };
}

/**
 * Fades out the end of 16-bit PCM WAV audio and adds a pause, so clips the model ends early don't stop mid-sound.
 * Other formats are returned unchanged.
 */
function finishSpeech(wav: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
	const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
	const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));
	if (wav.length < 44 || tag(0) != 'RIFF' || tag(8) != 'WAVE') return wav;

	let format: { channels: number; rate: number; bits: number; pcm: boolean } | undefined;
	let offset = 12;
	while (offset + 8 <= wav.length) {
		const size = view.getUint32(offset + 4, true);
		if (tag(offset) == 'fmt ') {
			format = {
				pcm: view.getUint16(offset + 8, true) == 1,
				channels: view.getUint16(offset + 10, true),
				rate: view.getUint32(offset + 12, true),
				bits: view.getUint16(offset + 22, true),
			};
		}
		if (tag(offset) == 'data') break;
		offset += 8 + size + (size % 2);
	}
	if (!format?.pcm || format.bits != 16 || tag(offset) != 'data') return wav;

	const start = offset + 8;
	const frameSize = format.channels * 2;
	const length = Math.min(view.getUint32(offset + 4, true), wav.length - start);
	const frames = Math.floor(length / frameSize);

	const fadeFrames = Math.min(frames, Math.round(format.rate * fadeLength));
	for (let frame = frames - fadeFrames; frame < frames; frame++) {
		const gain = (frames - frame) / fadeFrames;
		for (let channel = 0; channel < format.channels; channel++) {
			const position = start + frame * frameSize + channel * 2;
			view.setInt16(position, Math.round(view.getInt16(position, true) * gain), true);
		}
	}

	const pause = Math.round(format.rate * pauseLength) * frameSize;
	const result = new Uint8Array(start + frames * frameSize + pause);
	result.set(wav.subarray(0, start + frames * frameSize));
	const header = new DataView(result.buffer);
	header.setUint32(4, result.length - 8, true);
	header.setUint32(offset + 4, frames * frameSize + pause, true);
	return result;
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

		const speak = (speaker?: SpeakerReference) =>
			llama
				.send('v1/audio/speech', {
					method: 'POST',
					body: JSON.stringify({
						model,
						input,
						response_format: 'wav',
						seed,
						speaker_ref_b64: speaker?.audio,
						speaker_ref_text: speaker?.text,
					}),
					signal: request.signal,
				})
				.catch(withError('Could not reach llama-server', 502));

		let upstream = await speak(speaker);
		// Models without a voice encoder reject speaker references.
		if (upstream.status == 400) upstream = await speak();
		if (!upstream.ok) error(502, 'Could not speak: ' + (await upstreamError(upstream)));

		const audio = finishSpeech(await upstream.bytes());
		return new Response(audio, { headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/wav' } });
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
