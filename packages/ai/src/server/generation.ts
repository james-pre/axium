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
import * as loop from '../loop.js';
import { chat, streamChat } from '../node/chat.js';
import features from '@axium/core/features';
import { getMemories } from './memory.js';
import { getRow, learnCapabilities, resolveRole } from './models.js';
import { pick } from 'utilium';

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
	progress: loop.Progress;
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
	const progress = active.get(message.conversationId)?.progress;
	if (message.status != 'pending' || progress?.messageId != message.id) return message;
	return { ...message, content: progress.content, reasoning: progress.reasoning || null };
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

function toRow({ toolCalls, usage, ...changes }: loop.MessageChanges): Updateable<Schema['ai_messages']> {
	return {
		...changes,
		...(toolCalls !== undefined && { toolCalls: toolCalls && JSON.stringify(toolCalls) }),
		...(usage !== undefined && { usage: usage && JSON.stringify(usage) }),
	};
}

function savedStore(conversation: ConversationRow): loop.Store {
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
function temporaryStore(userId: string, conversationId: string, messages: ai.Message[]): loop.Store {
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

interface TurnInit extends Pick<
	loop.TurnInit,
	'store' | 'pending' | 'history' | 'decisions' | 'allowedTools' | 'allowForChat' | 'anonymous' | 'temporary'
> {
	/** `null` uses the chat role's model */
	model: string | null;
	reasoning: string;
	/** Called after the turn's final response */
	onDone?(model: string, content: string): void;
}

/** Saves tools the user allowed in every conversation */
async function allowAlways(userId: string, preferences: ai.Preferences, names: string[]): Promise<void> {
	for (const name of names) preferences.tools.approvals[name] = 'allow';

	await database
		.insertInto('app_preferences')
		.values({ userId, appId: 'ai', data: preferences })
		.onConflict(conflict => conflict.columns(['userId', 'appId']).doUpdateSet({ data: preferences }))
		.execute();
}

/** Responds with the server's model, streaming text to the user. Never throws. */
async function respond(init: TurnInit): Promise<void> {
	const { store } = init;
	const config = getConfig('@axium/ai');
	const controller = new AbortController();
	const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeout * 1000)]);
	const progress: loop.Progress = { messageId: init.pending.id, content: '', reasoning: '' };
	active.set(store.conversationId, { controller, userId: store.userId, progress });

	try {
		const id = init.model ?? (await resolveRole('chat'));
		const model = id && (await getRow(id));
		if (!model) throw new Error('No model is available');

		const [preferences, user] = await Promise.all([getPreferences(store.userId), getUser(store.userId)]);
		const remembers = preferences.tools.memory && features('ai-memory') && !init.anonymous;
		let streaming = false;

		await loop.respond({
			store,
			model,
			defaultSystemPrompt: config.system_prompt,
			maxSteps: config.max_steps,
			...pick(init, 'reasoning', 'pending', 'history', 'decisions', 'allowedTools', 'allowForChat', 'anonymous', 'temporary'),
			complete: request => streamChat({ ...request, model: model.id }),
			preferences,
			memories: remembers ? await getMemories(store.userId) : undefined,
			context: {
				userId: user.id,
				conversationId: init.temporary ? undefined : store.conversationId,
				signal,
				api: (method, endpoint, data, ...params) => callAPI(user, method, endpoint, data, ...params),
			},
			allowAlways: names => allowAlways(store.userId, preferences, names),
			progress,
			onText(field, text, position) {
				socketServer
					?.to('user:' + store.userId)
					.emit('ai.delta', { conversationId: store.conversationId, messageId: progress.messageId, field, text, position });

				if (streaming) return;
				streaming = true;
				void learnCapabilities(model.id);
			},
			onDone: content => init.onDone?.(model.id, content),
		});
	} catch (error) {
		io.warn(`AI: could not start a response in ${store.conversationId}: ${io.errorText(error)}`);
		await store
			.update(init.pending.id, { status: 'error', error: io.errorText(error) })
			.catch(error => io.error(`AI: could not finish response in ${store.conversationId}: ${io.errorText(error)}`));
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
