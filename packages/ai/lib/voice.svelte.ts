import * as ai from '@axium/ai/common';
import { SpeechBuffer } from '@axium/ai/speech';
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

export interface RecordOptions {
	/** Called once the speaker pauses after talking */
	onpause?(): void;
	/** Called when nobody talks for a while after recording starts */
	onsilence?(): void;
	/** Called about 60 times a second with the input level, from 0 to 1 */
	onlevel?(level: number): void;
}

/** How long a pause ends a recording, in milliseconds */
const pauseLength = 1200;

/** How long to wait for someone to talk, in milliseconds */
const silenceLength = 8000;

/** Watches a stream's input level to tell speech from background noise */
function detectSpeech(stream: MediaStream, options: RecordOptions): () => void {
	const context = new AudioContext();
	const analyser = context.createAnalyser();
	analyser.fftSize = 1024;
	context.createMediaStreamSource(stream).connect(analyser);

	const samples = new Float32Array(analyser.fftSize);
	const started = performance.now();
	let noise = 0.01,
		spoke = false,
		lastSpeech = started,
		frame = 0;

	function check(): void {
		analyser.getFloatTimeDomainData(samples);
		const level = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
		const now = performance.now();
		options.onlevel?.(Math.min(1, level * 8));

		if (now - started < 300) noise = Math.max(noise, level);
		else if (level > Math.max(0.02, noise * 2.5)) {
			spoke = true;
			lastSpeech = now;
		}

		if (spoke && now - lastSpeech > pauseLength) return options.onpause?.();
		if (!spoke && now - started > silenceLength) return options.onsilence?.();
		frame = requestAnimationFrame(check);
	}
	frame = requestAnimationFrame(check);

	return () => {
		cancelAnimationFrame(frame);
		void context.close();
	};
}

/**
 * Starts recording from the microphone, asking for permission when needed.
 * @throws when the microphone can't be used
 */
export async function record(options: RecordOptions = {}): Promise<Recording> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.addEventListener('dataavailable', event => chunks.push(event.data));
	recorder.start();

	const stopDetecting = options.onpause || options.onsilence || options.onlevel ? detectSpeech(stream, options) : undefined;

	function end(): Promise<void> {
		stopDetecting?.();
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

/** Speaks Markdown as it arrives, synthesizing each part while the one before it plays */
class Speaker {
	protected buffer = new SpeechBuffer();
	protected parts: string[] = [];
	protected ended = false;
	protected controller = new AbortController();
	protected wake?: () => void;
	/** Settles once everything is spoken or the speaker is stopped; rejects when speech can't be made or played */
	readonly done: Promise<void>;

	constructor(public readonly id: string) {
		this.done = this.run();
	}

	push(text: string): void {
		this.add(this.buffer.push(text));
	}

	/** Marks the text as complete, so what is left is spoken */
	end(): void {
		this.add(this.buffer.end());
		this.ended = true;
		this.wake?.();
	}

	stop(): void {
		this.controller.abort();
		this.wake?.();
	}

	protected add(parts: string[]): void {
		if (!parts.length) return;
		this.parts.push(...parts);
		this.wake?.();
	}

	/** Starts synthesizing the next part, waiting for one when none is ready */
	protected async next(): Promise<Promise<string> | undefined> {
		const { signal } = this.controller;
		while (!this.parts.length) {
			if (this.ended || signal.aborted) return;
			await new Promise<void>(resolve => (this.wake = resolve));
		}
		if (signal.aborted) return;

		const audio = synthesize(this.parts.shift()!, signal);
		audio.catch(() => {});
		return audio;
	}

	protected async run(): Promise<void> {
		const { signal } = this.controller;
		try {
			let upcoming = await this.next();
			while (upcoming && !signal.aborted) {
				const playing = play(await upcoming, signal);
				playing.catch(() => {});
				upcoming = await this.next();
				await playing;
			}
		} catch (error) {
			if (!signal.aborted) throw error;
		}
	}
}

let speaker = $state<Speaker>();

/** The ID of what is being spoken, e.g. a message's */
export function speaking(): string | undefined {
	return speaker?.id;
}

export function stopSpeaking(): void {
	speaker?.stop();
	speaker = undefined;
}

function startSpeaking(id: string): Speaker {
	stopSpeaking();
	const started = new Speaker(id);
	speaker = started;
	void started.done
		.catch(() => {})
		.finally(() => {
			if (speaker == started) speaker = undefined;
		});
	return started;
}

/**
 * Speaks Markdown aloud, replacing anything already being spoken.
 * @throws when the speech can't be made or played
 */
export async function speak(id: string, markdown: string): Promise<void> {
	const started = startSpeaking(id);
	started.push(markdown);
	started.end();
	await started.done;
}

export type Phase = 'idle' | 'listening' | 'transcribing' | 'responding' | 'speaking';

/** Conversation mode: talking with the assistant hands-free */
export const conversation = $state({
	active: false,
	phase: 'idle' as Phase,
	/** The microphone's level while listening, from 0 to 1 */
	level: 0,
	error: null as string | null,
});

/** Sends what the user said; set by the composer on the page */
type Sender = (text: string) => Promise<void>;

let sender: Sender | undefined;

/**
 * Sets how conversation mode sends what the user said.
 * @returns a function that unsets it
 */
export function useSender(send: Sender): () => void {
	sender = send;
	return () => {
		if (sender == send) sender = undefined;
	};
}

/** IDs of the user messages sent from this page by voice, whose replies are spoken */
const voiceTurns = new Set<string>();

/** Marks a sent user message as spoken, so its reply is read aloud in conversation mode */
export function addTurn(messageId: string): void {
	voiceTurns.add(messageId);
}

export function isTurn(messageId: string): boolean {
	return voiceTurns.has(messageId);
}

let recording: Recording | undefined;

/** Text of the current turn's replies that the speaker already has */
let followed = { turn: '', length: 0, ended: false };

function fail(error: unknown): void {
	conversation.error = error instanceof Error ? error.message : String(error);
	conversation.phase = 'idle';
}

async function finishListening(): Promise<void> {
	if (!recording || conversation.phase != 'listening') return;
	const current = recording;
	recording = undefined;
	conversation.level = 0;
	conversation.phase = 'transcribing';

	try {
		const text = await transcribe(await current.stop());
		if (!conversation.active) return;
		if (!text) {
			conversation.phase = 'idle';
			return;
		}
		if (!sender) throw new Error('Nothing can send messages on this page');
		conversation.phase = 'responding';
		await sender(text);
	} catch (error) {
		fail(error);
	}
}

/** Starts listening, interrupting anything being spoken */
export async function listen(): Promise<void> {
	stopSpeaking();
	recording?.cancel();
	conversation.error = null;
	conversation.phase = 'listening';

	try {
		recording = await record({
			onpause: () => void finishListening(),
			onsilence() {
				recording?.cancel();
				recording = undefined;
				conversation.level = 0;
				conversation.phase = 'idle';
			},
			onlevel: level => (conversation.level = level),
		});
	} catch (error) {
		fail(error);
	}
}

/** What the main button does: start listening, send what was said, or interrupt the reply */
export function toggle(): void {
	if (conversation.phase == 'listening') void finishListening();
	else if (conversation.phase != 'transcribing') void listen();
}

export function startConversation(): void {
	conversation.active = true;
	void listen();
}

export function endConversation(): void {
	conversation.active = false;
	conversation.phase = 'idle';
	conversation.level = 0;
	recording?.cancel();
	recording = undefined;
	stopSpeaking();
}

/**
 * Speaks the replies to a voice turn as they stream; call it whenever they change.
 * @param turn The ID of the user message the replies answer
 * @param text The replies' text so far, joined in order
 * @param complete Whether the replies are finished
 */
export function follow(turn: string, text: string, complete: boolean): void {
	if (!conversation.active || !voiceTurns.has(turn)) return;

	if (followed.turn != turn) {
		followed = { turn, length: 0, ended: false };
		startSpeaking(turn);
	}
	if (followed.ended || speaker?.id != turn) return;

	const current = speaker;
	if (text.length > followed.length) {
		conversation.phase = 'speaking';
		current.push(text.slice(followed.length));
		followed.length = text.length;
	}
	if (!complete) return;

	followed.ended = true;
	current.end();
	void current.done.then(
		() => {
			const waiting = conversation.phase == 'speaking' || conversation.phase == 'responding';
			if (conversation.active && waiting) void listen();
		},
		error => fail(error)
	);
}
