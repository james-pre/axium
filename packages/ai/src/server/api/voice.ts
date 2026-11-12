import { getConfig } from '@axium/core';
import features from '@axium/core/features';
import { requireSession } from '@axium/server/auth';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { readFile, stat } from 'node:fs/promises';
import * as ai from '../../common.js';
import * as llama from '../../node/llama.js';
import { resolveRole } from '../models.js';

/** The most audio accepted for transcription, in bytes */
const maxAudioSize = 32 * 1024 * 1024;

async function requireVoice(request: Request, role: 'stt' | 'tts'): Promise<string> {
	await requireSession(request);
	if (!features('ai-voice')) error(403, 'Voice is disabled');
	if (!llama.isRunning()) error(503, 'llama-server is not running');

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

/** The configured speaker reference in base64, read again when the file changes */
async function speakerReference(): Promise<string | undefined> {
	const path = getConfig('@axium/ai').speaker_reference;
	if (!path) return;

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

		const speaker = await speakerReference().catch(withError('Could not read the speaker reference', 500));

		const upstream = await llama
			.send('v1/audio/speech', {
				method: 'POST',
				body: JSON.stringify({ model, input: text, response_format: 'wav', speaker_ref_b64: speaker }),
				signal: request.signal,
			})
			.catch(withError('Could not reach llama-server', 502));
		if (!upstream.ok) error(502, 'Could not speak: ' + (await upstreamError(upstream)));

		return new Response(upstream.body, { headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/wav' } });
	},
});
