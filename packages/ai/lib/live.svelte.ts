import type { AIDelta, AIMessage, AIModelCapabilities } from '@axium/ai/common';
import { addListener, connect, onConnect } from '@axium/client/socket';
import { SvelteMap } from 'svelte/reactivity';

export interface ConversationWatcher {
	message(message: AIMessage): void;
	delta(delta: AIDelta): void;
	/** Updates sent while disconnected were missed */
	reconnect(): void;
}

const watchers = new Map<string, Set<ConversationWatcher>>();

/** Model capabilities learned by the server since the page loaded, by model ID */
export const learnedModels = new SvelteMap<string, AIModelCapabilities>();

let listening = false;

/** Starts receiving live updates. Safe to call more than once. */
export function listen(): void {
	if (listening) return;
	listening = true;

	addListener('ai.message', message => {
		for (const watcher of watchers.get(message.conversationId) ?? []) watcher.message(message);
	});

	addListener('ai.delta', delta => {
		for (const watcher of watchers.get(delta.conversationId) ?? []) watcher.delta(delta);
	});

	addListener('ai.model', model => learnedModels.set(model.id, model));

	onConnect(() => {
		for (const set of watchers.values()) for (const watcher of set) watcher.reconnect();
	});

	void connect().catch(() => null);
}

/**
 * Receive live updates to a conversation's messages.
 * @returns a function that stops watching
 */
export function watchConversation(id: string, watcher: ConversationWatcher): () => void {
	listen();

	const set = watchers.get(id) ?? new Set();
	set.add(watcher);
	watchers.set(id, set);

	return () => {
		set.delete(watcher);
		if (!set.size) watchers.delete(id);
	};
}
