import { getConfig } from '@axium/core';
import { getUser } from '@axium/server/auth';
import { callAPI } from '@axium/server/call';
import { database, type Schema } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium';
import type { Selectable, Updateable } from 'kysely';
import { randomUUID } from 'node:crypto';
import type schema from '../../db.json';
import * as ai from '../common.js';
import { chat, type ChatMessage } from '../node/chat.js';
import features from '@axium/core/features';
import { memoryPrompt } from '../memory.js';
import * as tools from '../tools.js';
import { getMemories } from './memory.js';
import { getDefaultModel, getRow, learnCapabilities } from './models.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

type MessageRow = Selectable<Schema['ai_messages']>;
type ConversationRow = Selectable<Schema['ai_conversations']>;

export function toMessage(row: MessageRow): ai.Message {
	return {
		...row,
		toolCalls: row.toolCalls as ai.ToolCall[] | null,
		usage: row.usage as ai.Usage | null,
	} as ai.Message;
}

export function emitMessage(userId: string, message: ai.Message): void {
	socketServer?.to('user:' + userId).emit('ai.message', message);
}

export function emitRemoved(userId: string, removed: ai.MessagesRemoved): void {
	socketServer?.to('user:' + userId).emit('ai.message.remove', removed);
}

interface Generation {
	controller: AbortController;
	userId: string;
	messageId: string;
	content: string;
	reasoning: string;
}

/** Running responses, by conversation ID */
const active = new Map<string, Generation>();

export function isGenerating(conversationId: string): boolean {
	return active.has(conversationId);
}

/** Stops the response being generated in a conversation, if it belongs to `userId` */
export function cancel(conversationId: string, userId: string): boolean {
	const generation = active.get(conversationId);
	if (generation?.userId != userId) return false;
	generation.controller.abort();
	return true;
}

/** Fills in the text streamed so far, which is only saved once the response ends */
export function withProgress(message: ai.Message): ai.Message {
	const generation = active.get(message.conversationId);
	if (message.status != 'pending' || generation?.messageId != message.id) return message;
	return { ...message, content: generation.content, reasoning: generation.reasoning || null };
}

async function getPreferences(userId: string): Promise<ai.Preferences> {
	const row = await database
		.selectFrom('app_preferences')
		.select('data')
		.where('userId', '=', userId)
		.where('appId', '=', 'ai')
		.executeTakeFirst();

	return ai.Preferences.safeParse(row?.data ?? {}).data ?? ai.Preferences.parse({});
}

const toolGuidance =
	'You can call tools. Only call one when it helps with what the user asked. ' +
	'If a call fails, read the error and correct the input instead of repeating the same call. ' +
	"Never create, change or delete anything the user didn't ask for, even as a workaround. " +
	'Only say an action was done when a tool result confirms it; if you could not do something, say so.';

interface PromptParts {
	/** The model's system prompt, or the configured default */
	prompt?: string | null;
	instructions?: string;
	offered: tools.Tool[];
	/** The section about what the model remembers */
	memory?: string;
}

function systemPrompt({ prompt, instructions, offered, memory }: PromptParts): string {
	const now = new Date();
	const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

	const sections = [prompt ?? getConfig('@axium/ai').system_prompt];
	sections.push(`Today is ${date}.`);
	if (offered.length) sections.push(toolGuidance);
	if (memory) sections.push(memory);
	if (instructions) sections.push(`The user has given these instructions for every conversation:\n\n${instructions}`);

	return sections.join('\n\n');
}

/** A message as the model sees it, or nothing for messages it shouldn't see */
function toChatMessage(message: ai.Message): ChatMessage | undefined {
	switch (message.role) {
		case 'user':
			return { role: 'user', content: message.content };
		case 'tool':
			return {
				role: 'tool',
				tool_call_id: message.toolCallId!,
				content: message.status == 'cancelled' ? 'Cancelled by the user.' : message.content,
			};
		case 'assistant':
			if (message.status == 'error' || (!message.content && !message.toolCalls?.length)) return;
			return {
				role: 'assistant',
				content: message.content || null,
				tool_calls: message.toolCalls?.map(call => ({
					id: call.id,
					type: 'function',
					function: { name: call.name, arguments: call.arguments },
				})),
			};
	}
}

type MessageChanges = Partial<Omit<ai.Message, 'id' | 'conversationId' | 'created'>>;

/** Where a conversation's messages are kept. Changes are sent to the user. */
interface Store {
	userId: string;
	conversationId: string;
	add(message: MessageChanges & Pick<ai.Message, 'role'>): Promise<ai.Message>;
	update(id: string, changes: MessageChanges): Promise<ai.Message>;
}

function toRow({ toolCalls, usage, ...changes }: MessageChanges): Updateable<Schema['ai_messages']> {
	return {
		...changes,
		...(toolCalls !== undefined && { toolCalls: toolCalls && JSON.stringify(toolCalls) }),
		...(usage !== undefined && { usage: usage && JSON.stringify(usage) }),
	};
}

function savedStore(conversation: ConversationRow): Store {
	return {
		userId: conversation.userId,
		conversationId: conversation.id,
		async add(message) {
			const row = await database
				.insertInto('ai_messages')
				.values({ ...toRow(message), role: message.role, conversationId: conversation.id })
				.returningAll()
				.executeTakeFirstOrThrow();
			const added = toMessage(row);
			emitMessage(conversation.userId, added);
			return added;
		},
		async update(id, changes) {
			const row = await database
				.updateTable('ai_messages')
				.set(toRow(changes))
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow();
			const updated = toMessage(row);
			emitMessage(conversation.userId, updated);
			return updated;
		},
	};
}

/** Keeps messages only long enough to send them; the client holds temporary conversations */
function temporaryStore(userId: string, conversationId: string, messages: ai.Message[]): Store {
	const known = new Map(messages.map(message => [message.id, message]));

	return {
		userId,
		conversationId,
		add(message) {
			const added: ai.Message = {
				id: randomUUID(),
				conversationId,
				created: new Date(),
				content: '',
				reasoning: null,
				toolCalls: null,
				toolCallId: null,
				status: 'done',
				error: null,
				usage: null,
				...message,
			};
			known.set(added.id, added);
			emitMessage(userId, added);
			return Promise.resolve(added);
		},
		update(id, changes) {
			const existing = known.get(id);
			if (!existing) return Promise.reject(new ReferenceError(`Unknown message ${id}`));
			const updated = { ...existing, ...changes };
			known.set(id, updated);
			emitMessage(userId, updated);
			return Promise.resolve(updated);
		},
	};
}

interface TurnInit {
	store: Store;
	/** `null` uses the default model */
	model: string | null;
	reasoning: string;
	/** The pending assistant message to respond with */
	pending: ai.Message;
	/** The conversation before `pending`, oldest first */
	history(): Promise<ai.Message[]>;
	/** For tool calls awaiting the user; calls without a decision are denied */
	decisions?: ai.Decisions;
	/** Names of tools the user allowed for the rest of the conversation */
	allowedTools: string[];
	/** Saves tools the user just allowed for the rest of the conversation */
	allowForChat?(names: string[]): Promise<void>;
	/** Leaves out the user's memories and tools that use their data */
	anonymous?: boolean;
	/** For conversations that are never saved, which never save memories */
	temporary?: boolean;
	/** Called after the turn's final response */
	onDone?(model: string, content: string): void;
}

const repeatedFailure: tools.CallResult = {
	status: 'error',
	content: 'Error: this exact call already failed. Change the input or answer without it.',
	error: 'Repeated a failed call',
};

/** Saves tools the user allowed in every conversation */
async function allowAlways(userId: string, preferences: ai.Preferences, names: string[]): Promise<void> {
	for (const name of names) preferences.tools.approvals[name] = 'allow';

	await database
		.insertInto('app_preferences')
		.values({ userId, appId: 'ai', data: preferences })
		.onConflict(conflict => conflict.columns(['userId', 'appId']).doUpdateSet({ data: preferences }))
		.execute();
}

/**
 * Runs or denies the tool calls in `history` that await the user, replacing them with the results.
 * Tools the user allowed beyond this call are added to `allowed` and saved.
 */
async function resolveAwaiting(
	history: ai.Message[],
	init: TurnInit,
	context: tools.Context,
	preferences: ai.Preferences,
	allowed: Set<string>
): Promise<void> {
	const calls = new Map(history.flatMap(message => message.toolCalls ?? []).map(call => [call.id, call]));
	const forChat = new Set<string>();
	const always = new Set<string>();

	for (const [index, message] of history.entries()) {
		if (message.role != 'tool' || message.status != 'awaiting') continue;

		const call = calls.get(message.toolCallId!);
		const decision = call && init.decisions?.[call.id];

		if (!call || !decision || decision == 'deny') {
			history[index] = await init.store.update(message.id, {
				status: 'error',
				content: 'The user denied this action.',
				error: 'Denied',
			});
			continue;
		}

		if (decision == 'chat') forChat.add(call.name);
		if (decision == 'always') always.add(call.name);

		history[index] = await init.store.update(message.id, await tools.run(tools.get(call.name), call, context));
	}

	for (const name of forChat) allowed.add(name);
	if (forChat.size) await init.allowForChat?.([...allowed]);
	if (always.size) await allowAlways(init.store.userId, preferences, [...always]);
}

/** Anything more than this is probably a bug. */
const stepUpperBound = 1000;

/**
 * Responds to a conversation, calling tools until the model gives a final answer or a call needs the user's approval.
 * Text is sent to the user as it streams. Never throws.
 */
async function respond(init: TurnInit): Promise<void> {
	const { store } = init;
	const config = getConfig('@axium/ai');
	const controller = new AbortController();
	const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeout * 1000)]);
	const generation: Generation = { controller, userId: store.userId, messageId: init.pending.id, content: '', reasoning: '' };
	active.set(store.conversationId, generation);

	/** The assistant message being streamed into, until it finishes */
	let pending: ai.Message | null = init.pending;
	/** Tool messages whose calls are running */
	const running = new Set<string>();
	let model: string | undefined;
	let streaming = false;

	function append(field: 'content' | 'reasoning', text: string): void {
		const position = generation[field].length;
		generation[field] += text;
		socketServer
			?.to('user:' + store.userId)
			.emit('ai.delta', { conversationId: store.conversationId, messageId: generation.messageId, field, text, position });

		if (streaming || !model) return;
		streaming = true;
		void learnCapabilities(model);
	}

	try {
		model = init.model ?? (await getDefaultModel());
		const settings = model && (await getRow(model));
		if (!model || !settings) throw new Error('No model is available');

		const [preferences, user] = await Promise.all([getPreferences(store.userId), getUser(store.userId)]);
		const context: tools.Context = {
			userId: user.id,
			conversationId: init.temporary ? undefined : store.conversationId,
			signal,
			api: (method, endpoint, data, ...params) => callAPI(user, method, endpoint, data, ...params),
		};
		const offered =
			settings.tools === false ? [] : tools.allowed(preferences.tools, { anonymous: init.anonymous, temporary: init.temporary });
		const definitions = tools.definitions(offered);

		const remembers = preferences.tools.memory && features('ai-memory') && !init.anonymous;
		const memories = remembers ? await getMemories(store.userId) : [];
		const memory = remembers
			? memoryPrompt(
					memories,
					offered.some(tool => tool.environment == 'memory' && tool.access == 'write')
				)
			: undefined;

		const allowed = new Set(init.allowedTools);
		const history = await init.history();
		await resolveAwaiting(history, init, context, preferences, allowed);

		const messages: ChatMessage[] = [
			{
				role: 'system',
				content: systemPrompt({ prompt: settings.systemPrompt, instructions: preferences.instructions?.trim(), offered, memory }),
			},
			...history.map(toChatMessage).filter(message => !!message),
		];

		/** Calls that failed, by name and arguments */
		const failed = new Set<string>();

		for (let step = 1; step < stepUpperBound; step++) {
			const result = await chat({
				model,
				messages,
				reasoning: init.reasoning == 'default' ? (settings.reasoning ?? 'default') : init.reasoning,
				tools: step < config.max_steps ? definitions : undefined,
				signal,
				onContent: text => append('content', text),
				onReasoning: text => append('reasoning', text),
			});

			const calls = result.toolCalls.filter(call => call.name).map(call => ({ ...call, id: call.id || 'call_' + randomUUID() }));

			const finished: ai.Message = await store.update(pending.id, {
				content: result.content,
				reasoning: result.reasoning || null,
				toolCalls: calls.length ? calls : null,
				status: 'done',
				usage: result.usage,
			});
			pending = null;

			if (!calls.length) {
				init.onDone?.(model, result.content);
				return;
			}

			messages.push(toChatMessage(finished)!);

			let awaiting = false;
			const queue: { call: ai.ToolCall; tool?: tools.Tool; message: ai.Message }[] = [];

			for (const call of calls) {
				const tool = tools.get(call.name);
				const approval = tools.needsApproval(tool, preferences.tools, allowed);
				const message = await store.add({ role: 'tool', toolCallId: call.id, status: approval ? 'awaiting' : 'pending' });

				if (approval) awaiting = true;
				else {
					running.add(message.id);
					queue.push({ call, tool, message });
				}
			}

			for (const { call, tool, message } of queue) {
				signal.throwIfAborted();

				const key = call.name + '\n' + call.arguments;
				const outcome = failed.has(key) ? repeatedFailure : await tools.run(tool, call, context);
				if (outcome.status == 'error') failed.add(key);

				const done = await store.update(message.id, signal.aborted ? { status: 'cancelled' } : outcome);
				running.delete(message.id);
				messages.push(toChatMessage(done)!);
			}

			signal.throwIfAborted();
			if (awaiting) return;

			pending = await store.add({ role: 'assistant', status: 'pending' });
			Object.assign(generation, { messageId: pending.id, content: '', reasoning: '' });
		}
	} catch (error) {
		const cancelled = controller.signal.aborted;
		if (!cancelled) io.warn(`AI: response in ${store.conversationId} failed: ${io.errorText(error)}`);
		const reason = cancelled ? null : error instanceof Error && error.name == 'TimeoutError' ? 'Timed out' : io.errorText(error);

		try {
			for (const id of running) await store.update(id, { status: cancelled ? 'cancelled' : 'error', error: reason });
			if (pending) {
				await store.update(pending.id, {
					content: generation.content,
					reasoning: generation.reasoning || null,
					status: cancelled ? 'cancelled' : 'error',
					error: reason,
				});
			}
		} catch (error) {
			io.error(`AI: could not finish response in ${store.conversationId}: ${io.errorText(error)}`);
		}
	} finally {
		active.delete(store.conversationId);
	}
}

async function savedHistory(conversationId: string, exclude: string): Promise<ai.Message[]> {
	const rows = await database
		.selectFrom('ai_messages')
		.selectAll()
		.where('conversationId', '=', conversationId)
		.where('id', '!=', exclude)
		.orderBy('created')
		.execute();

	return rows.map(toMessage);
}

/** Responds into the pending `message` of a saved conversation. Never throws. */
export async function generate(conversation: ConversationRow, message: MessageRow, decisions?: ai.Decisions): Promise<void> {
	await respond({
		store: savedStore(conversation),
		model: conversation.model,
		reasoning: conversation.reasoning,
		pending: toMessage(message),
		history: () => savedHistory(conversation.id, message.id),
		decisions,
		allowedTools: conversation.allowedTools,
		async allowForChat(names) {
			const updated = await database
				.updateTable('ai_conversations')
				.set({ allowedTools: names })
				.where('id', '=', conversation.id)
				.returningAll()
				.executeTakeFirstOrThrow();
			socketServer?.to('user:' + conversation.userId).emit('ai.conversation', updated);
		},
		onDone: (model, content) => void nameConversation(conversation, model, content),
	});
}

/** Responds into `pending` for a temporary conversation, which is never saved. Never throws. */
export async function generateTemporary(userId: string, init: ai.TemporaryInit, pending: ai.Message): Promise<void> {
	const history = init.messages.map((message): ai.Message => ({
		conversationId: pending.conversationId,
		created: new Date(),
		reasoning: null,
		error: null,
		usage: null,
		...message,
		toolCalls: message.toolCalls ?? null,
		toolCallId: message.toolCallId ?? null,
		status: message.status ?? 'done',
	}));

	await respond({
		store: temporaryStore(userId, pending.conversationId, [...history, pending]),
		model: init.model ?? null,
		reasoning: init.reasoning,
		pending,
		history: () => Promise.resolve(history),
		decisions: init.decisions,
		allowedTools: init.allowedTools,
		anonymous: init.anonymous,
		temporary: true,
	});
}

const titlePrompt = 'Write a title of 2 to 6 words for the conversation below. Reply with only the title.';

/** Titles a conversation from its first exchange, unless it already has a title from a model or the user */
async function nameConversation(conversation: ConversationRow, model: string, reply: string): Promise<void> {
	if (conversation.titleSource != 'none') return;

	try {
		const first = await database
			.selectFrom('ai_messages')
			.select('content')
			.where('conversationId', '=', conversation.id)
			.where('role', '=', 'user')
			.orderBy('created')
			.limit(1)
			.executeTakeFirst();
		if (!first) return;

		const result = await chat({
			model,
			reasoning: 'none',
			maxTokens: 24,
			signal: AbortSignal.timeout(30_000),
			messages: [
				{ role: 'system', content: titlePrompt },
				{ role: 'user', content: `User: ${first.content.slice(0, 2000)}\n\nAssistant: ${reply.slice(0, 2000)}` },
			],
		});

		const title = result.content
			.split('\n')
			.find(line => line.trim())
			?.replace(/^[\s"'*#]+|[\s"'*.]+$/g, '')
			.slice(0, 100);
		if (!title) return;

		const updated = await database
			.updateTable('ai_conversations')
			.set({ title, titleSource: 'auto' })
			.where('id', '=', conversation.id)
			.where('titleSource', '=', 'none')
			.returningAll()
			.executeTakeFirst();

		if (updated) socketServer?.to('user:' + conversation.userId).emit('ai.conversation', updated);
	} catch (error) {
		io.debug(`AI: could not title ${conversation.id}: ${io.errorText(error)}`);
	}
}

/** Marks responses and tool calls left pending by a previous process as failed */
export async function failInterrupted(): Promise<void> {
	await database
		.updateTable('ai_messages')
		.set({ status: 'error', error: 'Interrupted by a server restart' })
		.where('status', '=', 'pending')
		.execute();
}
