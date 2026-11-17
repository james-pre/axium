import type * as ai from '@axium/ai/common';
import { fetchAPI } from '@axium/client/requests';
import { addListener, connect, onConnect } from '@axium/client/socket';
import { SvelteMap } from 'svelte/reactivity';

/** Running timers, by ID */
export const running = new SvelteMap<string, ai.Timer>();

/** Timers that ended while the page was open and haven't been dismissed, by ID */
export const finished = new SvelteMap<string, ai.Timer>();

let userId: string | undefined;
let listening = false;

async function refresh(): Promise<void> {
	if (!userId) return;
	const timers = await fetchAPI('GET', 'users/:id/ai/timers', {}, userId);
	running.clear();
	for (const timer of timers) running.set(timer.id, timer);
}

/** Starts tracking the user's timers. Safe to call more than once. */
export function useTimers(id: string): void {
	if (userId != id) {
		userId = id;
		void refresh().catch(() => null);
	}

	if (listening) return;
	listening = true;

	addListener('ai.timer', timer => running.set(timer.id, timer));

	addListener('ai.timer.remove', ({ id, done }) => {
		const timer = running.get(id);
		running.delete(id);
		if (!done || !timer) return;
		finished.set(id, timer);
		ring();
	});

	onConnect(() => void refresh().catch(() => null));
	void connect().catch(() => null);
}

export async function cancel(id: string): Promise<void> {
	if (!userId) return;
	await fetchAPI('DELETE', 'users/:id/ai/timers/:timer', {}, userId, id);
	running.delete(id);
}

export function dismiss(id: string): void {
	finished.delete(id);
	if (!finished.size) stopRinging();
}

/** How long the alarm sounds before stopping on its own, in milliseconds */
const ringDuration = 30_000;

let audio: AudioContext | undefined;
let ringing: ReturnType<typeof setInterval> | undefined;

function beep(): void {
	audio ??= new AudioContext();
	void audio.resume();

	for (let i = 0; i < 3; i++) {
		const start = audio.currentTime + i * 0.25;
		const oscillator = audio.createOscillator();
		const gain = audio.createGain();
		oscillator.frequency.value = 880;
		gain.gain.setValueAtTime(0.15, start);
		gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
		oscillator.connect(gain).connect(audio.destination);
		oscillator.start(start);
		oscillator.stop(start + 0.15);
	}
}

function ring(): void {
	if (ringing) return;

	const started = Date.now();
	beep();
	ringing = setInterval(() => {
		if (Date.now() - started > ringDuration) stopRinging();
		else beep();
	}, 2000);
}

function stopRinging(): void {
	clearInterval(ringing);
	ringing = undefined;
}
