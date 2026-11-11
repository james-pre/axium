import type { AIConversation, AIDelta, AIMessage, AIModel } from '@axium/ai/common';
import { addListener, connect, onConnect } from '@axium/client/socket';
import { SvelteMap } from 'svelte/reactivity';

export interface ConversationWatcher {
	message(message: AIMessage): void;
	delta(delta: AIDelta): void;
	/** Updates sent while disconnected were missed */
	reconnect(): void;
}

const watchers = new Map<string, Set<ConversationWatcher>>();

const conversationListeners = new Set<(conversation: AIConversation) => void>();

/** Models that changed since the page loaded, by ID; `null` for removed models */
export const modelUpdates = new SvelteMap<string, AIModel | null>();

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

	addListener('ai.conversation', conversation => {
		for (const listener of conversationListeners) listener(conversation);
	});

	addListener('ai.model', model => modelUpdates.set(model.id, model));
	addListener('ai.model.remove', id => modelUpdates.set(id, null));

	onConnect(() => {
		for (const set of watchers.values()) for (const watcher of set) watcher.reconnect();
	});

	void connect().catch(() => null);
}

/**
 * Receive changes to the current user's conversations.
 * @returns a function that stops listening
 */
export function onConversationChange(listener: (conversation: AIConversation) => void): () => void {
	listen();
	conversationListeners.add(listener);
	return () => conversationListeners.delete(listener);
}

/** `models` with the live updates received since they were fetched */
export function withUpdates(models: AIModel[]): AIModel[] {
	listen();

	const updated: AIModel[] = [];
	for (const model of models) {
		const update = modelUpdates.get(model.id);
		if (update !== null) updated.push(update ?? model);
	}

	for (const [id, update] of modelUpdates) {
		if (update && !models.some(model => model.id == id)) updated.push(update);
	}

	return updated;
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
