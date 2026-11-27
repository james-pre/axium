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
import type * as ai from '../common.js';
import * as loop from '../loop.js';
import { chat, countTokens, requestLimit, streamChat } from '../node/chat.js';
import { measure } from '../node/context.js';
import features from '@axium/core/features';
import { getMemories } from './memory.js';
import { getPreferences } from './preferences.js';
import * as sandboxes from './sandbox.js';
import * as timers from './timers.js';
import { getModel, getRow, learnCapabilities, resolveRole } from './models.js';
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
		attachments: row.attachments as ai.Attachment[] | null,
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
				voice: false,
				attachments: null,
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
	'store' | 'pending' | 'history' | 'decisions' | 'allowedTools' | 'allowForChat' | 'anonymous'
> {
	/** For conversations that are never saved */
	temporary?: boolean;
	/** `null` uses the chat role's model */
	model: string | null;
	reasoning: string;
	/** Called after the turn's final response */
	onDone?(model: string, content: string): void;
	/** The time zone of the session the turn was requested from */
	timeZone?: string | null;
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

/** The model a conversation uses, with what llama-server reports about it now */
async function modelSettings(id: string | null) {
	id ??= (await resolveRole('chat')) ?? null;
	const [row, model] = id ? await Promise.all([getRow(id), getModel(id)]) : [];
	if (!row) throw new Error('No model is available');
	return { ...row, inputs: model?.inputs, status: model?.status };
}

/** What a turn needs to know about its user, beyond the conversation */
async function turnSettings(userId: string, conversationId: string, { anonymous, temporary }: Pick<TurnInit, 'anonymous' | 'temporary'>) {
	const [preferences, user] = await Promise.all([getPreferences(userId), getUser(userId)]);
	const remembers = preferences.tools.memory && features('ai-memory') && !anonymous;
	return {
		preferences,
		user,
		memories: remembers ? await getMemories(userId) : undefined,
		sandbox: sandboxes.forConversation(userId, conversationId, {
			temporary: !!temporary,
			network: features('ai-network') ? preferences.tools.sandbox_network : 'none',
		}),
	};
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
		const model = await modelSettings(init.model);
		const { preferences, user, memories, sandbox } = await turnSettings(store.userId, store.conversationId, init);
		let streaming = false;

		await loop.respond({
			store,
			model,
			defaultSystemPrompt: config.system_prompt,
			maxSteps: config.max_steps,
			...pick(init, 'reasoning', 'pending', 'history', 'decisions', 'allowedTools', 'allowForChat', 'anonymous'),
			complete: request => streamChat({ ...request, model: model.id }),
			preferences,
			timeZone: init.timeZone ?? user.preferences.time_zone,
			homeTimeZone: user.preferences.time_zone,
			memories,
			context: {
				userId: user.id,
				conversationId: init.temporary ? undefined : store.conversationId,
				signal,
				api: (method, endpoint, data, ...params) => callAPI(user, method, endpoint, data, ...params),
				timers: timers.forUser(user.id),
				sandbox,
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

async function savedHistory(conversationId: string, exclude?: string): Promise<ai.Message[]> {
	let query = database.selectFrom('ai_messages').selectAll().where('conversationId', '=', conversationId);
	if (exclude) query = query.where('id', '!=', exclude);
	const rows = await query.orderBy('created').execute();

	return rows.map(toMessage);
}

export interface GenerateOptions extends Pick<TurnInit, 'decisions' | 'timeZone'> {}

/** Responds into the pending `message` of a saved conversation. Never throws. */
export async function generate(
	conversation: ConversationRow,
	message: MessageRow,
	{ decisions, timeZone }: GenerateOptions
): Promise<void> {
	await respond({
		timeZone,
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

/** A temporary conversation's messages, as the client sent them */
function temporaryHistory(conversationId: string, messages: ai.TemporaryMessage[]): ai.Message[] {
	return messages.map((message): ai.Message => ({
		conversationId,
		reasoning: null,
		error: null,
		...message,
		usage: message.usage ?? null,
		attachments: message.attachments ?? null,
		toolCalls: message.toolCalls ?? null,
		toolCallId: message.toolCallId ?? null,
		status: message.status ?? 'done',
	}));
}

/** Responds into `pending` for a temporary conversation, which is never saved. Never throws. */
export async function generateTemporary(
	userId: string,
	init: ai.TemporaryInit,
	pending: ai.Message,
	timeZone?: string | null
): Promise<void> {
	const history = temporaryHistory(pending.conversationId, init.messages);

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
		timeZone,
	});
}

interface ContextInit extends Pick<TurnInit, 'model' | 'reasoning' | 'anonymous' | 'temporary' | 'timeZone'> {
	userId: string;
	conversationId: string;
	history: ai.Message[];
	/** Also counts what each part takes up */
	parts?: boolean;
	/** Also returns the system prompt */
	prompt?: boolean;
	signal?: AbortSignal;
}

/**
 * How much of the model's context the conversation's next request takes up.
 * Counting needs the model loaded, so otherwise this falls back to the size of the last response's request.
 */
async function measureContext(init: ContextInit): Promise<ai.ContextUsage> {
	const model = await modelSettings(init.model);

	const last = init.history.findLast(message => message.role == 'assistant' && message.usage)?.usage;
	const fallback: ai.ContextUsage = {
		model: model.id,
		counted: false,
		used: last ? last.promptTokens + last.completionTokens : undefined,
	};
	if (model.status != 'loaded' && !init.prompt) return fallback;

	const { preferences, user, memories, sandbox } = await turnSettings(init.userId, init.conversationId, init);
	const request = loop.createRequest({
		model,
		reasoning: init.reasoning,
		defaultSystemPrompt: getConfig('@axium/ai').system_prompt,
		preferences,
		memories,
		anonymous: init.anonymous,
		timeZone: init.timeZone ?? user.preferences.time_zone,
		homeTimeZone: user.preferences.time_zone,
		context: { sandbox },
		history: init.history,
	});

	if (init.prompt) {
		const [system] = request.messages;
		if (typeof system.content == 'string') fallback.prompt = system.content;
	}
	if (model.status != 'loaded') return fallback;

	try {
		const limit = await requestLimit(model.id, init.signal);
		const { prompt } = fallback;
		if (init.parts) return { model: model.id, counted: true, limit, prompt, ...(await measure(model.id, request, init.signal)) };

		const used = await countTokens({ model: model.id, ...pick(request, 'messages', 'tools', 'reasoning'), signal: init.signal });
		return { model: model.id, counted: true, limit, used, prompt };
	} catch (error) {
		io.debug(`AI: could not count the context of ${init.conversationId}: ${io.errorText(error)}`);
		return fallback;
	}
}

export async function savedContext(conversation: ConversationRow, options: Pick<ContextInit, 'timeZone' | 'parts' | 'prompt' | 'signal'>) {
	return await measureContext({
		...options,
		userId: conversation.userId,
		conversationId: conversation.id,
		model: conversation.model,
		reasoning: conversation.reasoning,
		history: await savedHistory(conversation.id),
	});
}

export async function temporaryContext(
	userId: string,
	conversationId: string,
	init: ai.TemporaryContext,
	options: Pick<ContextInit, 'timeZone' | 'signal'>
) {
	return await measureContext({
		...options,
		userId,
		conversationId,
		model: init.model ?? null,
		reasoning: init.reasoning,
		anonymous: init.anonymous,
		temporary: true,
		parts: init.parts,
		prompt: init.prompt,
		history: temporaryHistory(conversationId, init.messages),
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
