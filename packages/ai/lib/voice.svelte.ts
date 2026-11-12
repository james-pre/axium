import * as ai from '@axium/ai/common';
import { logWarnings, prefix, token } from '@axium/client/requests';
import features from '@axium/core/features';

/** What voice features the instance's models allow */
export const available = $state({ dictation: false, speech: false });

/** Updates what is {@link available} from the instance's models */
export function useModels({ models, roles }: Pick<ai.Models, 'models' | 'roles'>): void {
	const enabled = features('ai-voice');
	available.dictation = enabled && !!navigator.mediaDevices && !!ai.resolveRole(models, roles, 'stt');
	available.speech = enabled && !!ai.resolveRole(models, roles, 'tts');
}

async function request(path: string, init: RequestInit): Promise<Response> {
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', 'Bearer ' + token);

	const response = await fetch(prefix + path, { ...init, headers });
	logWarnings(response);
	if (response.ok) return response;

	const body = await response.json().catch(() => null);
	throw new Error(body?.message ?? response.statusText);
}

/** Samples per second of recordings sent for transcription */
const recordingRate = 16_000;

/** Mono 16-bit PCM in a WAV container */
function encodeWAV(samples: Float32Array, rate: number): Blob {
	const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
	const writeText = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};

	writeText(0, 'RIFF');
	view.setUint32(4, 36 + samples.length * 2, true);
	writeText(8, 'WAVEfmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeText(36, 'data');
	view.setUint32(40, samples.length * 2, true);

	for (const [index, sample] of samples.entries()) {
		const clamped = Math.max(-1, Math.min(1, sample));
		view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
	}

	return new Blob([view], { type: 'audio/wav' });
}

/** Converts a recording in any format the browser can decode */
async function toWAV(recording: Blob): Promise<Blob> {
	const context = new AudioContext();
	try {
		const decoded = await context.decodeAudioData(await recording.arrayBuffer());
		const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * recordingRate), recordingRate);
		const source = offline.createBufferSource();
		source.buffer = decoded;
		source.connect(offline.destination);
		source.start();
		return encodeWAV((await offline.startRendering()).getChannelData(0), recordingRate);
	} finally {
		void context.close();
	}
}

export interface Recording {
	/** Ends the recording and gives it as WAV */
	stop(): Promise<Blob>;
	/** Ends the recording and discards it */
	cancel(): void;
}

/**
 * Starts recording from the microphone, asking for permission when needed.
 * @throws when the microphone can't be used
 */
export async function record(): Promise<Recording> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.addEventListener('dataavailable', event => chunks.push(event.data));
	recorder.start();

	function end(): Promise<void> {
		const { promise, resolve } = Promise.withResolvers<void>();
		recorder.addEventListener('stop', () => resolve(), { once: true });
		if (recorder.state != 'inactive') recorder.stop();
		else resolve();
		for (const track of stream.getTracks()) track.stop();
		return promise;
	}

	return {
		async stop() {
			await end();
			return await toWAV(new Blob(chunks, { type: recorder.mimeType }));
		},
		cancel: () => void end(),
	};
}

export async function transcribe(audio: Blob): Promise<string> {
	const response = await request('ai/transcription', {
		method: 'POST',
		body: audio,
		headers: { 'Content-Type': audio.type, Accept: 'application/json' },
	});
	const { text } = ai.Transcription.parse(await response.json());
	return text;
}

/** Markdown as it should be read aloud: no code blocks, markup or link targets */
export function speakable(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?(?:```|$)/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
		.replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm, '')
		.replace(/^[ \t]*\|[ \t]*|[ \t]*\|[ \t]*$/gm, '')
		.replace(/[ \t]*\|[ \t]*/g, ', ')
		.replace(/[*_~`]+/g, '')
		.replace(/[ \t]+/g, ' ')
		.replace(/([^\s.!?:;,])[ \t]*\n+/g, '$1.\n')
		.replace(/\s*\n\s*/g, '\n')
		.trim();
}

/** The most characters spoken in one request, which keeps each part well within what the model generates at once */
const maxPartLength = 300;

/** Splits text into parts to speak one after another, at sentence and line boundaries where possible */
export function speechParts(text: string): string[] {
	const sentences = text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)\s*/g) ?? [];
	const parts: string[] = [];
	let current = '';

	for (const sentence of sentences) {
		if (current && current.length + sentence.length > maxPartLength) {
			parts.push(current.trim());
			current = '';
		}

		let rest = sentence;
		while (rest.length > maxPartLength) {
			const space = rest.lastIndexOf(' ', maxPartLength);
			const end = space > 0 ? space : maxPartLength;
			parts.push(rest.slice(0, end).trim());
			rest = rest.slice(end).trimStart();
		}
		current += rest;
	}

	if (current.trim()) parts.push(current.trim());
	return parts.filter(part => /[\p{L}\p{N}]/u.test(part));
}

async function synthesize(text: string, signal: AbortSignal): Promise<string> {
	const response = await request('ai/speech', {
		method: 'POST',
		body: JSON.stringify({ text }),
		headers: { 'Content-Type': 'application/json' },
		signal,
	});
	return URL.createObjectURL(await response.blob());
}

function play(url: string, signal: AbortSignal): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const audio = new Audio(url);

	const stop = () => {
		audio.pause();
		resolve();
	};
	signal.addEventListener('abort', stop, { once: true });

	audio.addEventListener('ended', () => resolve(), { once: true });
	audio.addEventListener('error', () => reject(new Error('Could not play the audio')), { once: true });
	audio.play().catch(reject);

	return promise.finally(() => {
		signal.removeEventListener('abort', stop);
		URL.revokeObjectURL(url);
	});
}

interface Speech {
	/** What is being spoken, e.g. a message ID */
	id: string;
	controller: AbortController;
}

let current = $state<Speech>();

/** The ID given to {@link speak} for what is being spoken */
export function speaking(): string | undefined {
	return current?.id;
}

export function stopSpeaking(): void {
	current?.controller.abort();
	current = undefined;
}

/**
 * Speaks Markdown aloud, replacing anything already being spoken. Each part is fetched while the one before it plays.
 * @throws when the speech can't be made or played
 */
export async function speak(id: string, markdown: string): Promise<void> {
	stopSpeaking();

	const controller = new AbortController();
	const { signal } = controller;
	current = { id, controller };

	try {
		const parts = speechParts(speakable(markdown));
		let next = parts.length ? synthesize(parts[0], signal) : undefined;

		for (let index = 0; next && !signal.aborted; index++) {
			const url = await next;
			next = index + 1 < parts.length ? synthesize(parts[index + 1], signal) : undefined;
			next?.catch(() => {});
			await play(url, signal);
		}
	} catch (error) {
		if (!signal.aborted) throw error;
	} finally {
		if (current?.controller == controller) current = undefined;
	}
}
