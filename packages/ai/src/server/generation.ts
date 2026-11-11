import { getConfig } from '@axium/core';
import { database, type Schema } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium';
import type { Selectable } from 'kysely';
import type schema from '../../db.json';
import * as ai from '../common.js';
import { chat, type ChatMessage } from './chat.js';
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

async function userInstructions(userId: string): Promise<string | undefined> {
	const row = await database
		.selectFrom('app_preferences')
		.select('data')
		.where('userId', '=', userId)
		.where('appId', '=', 'ai')
		.executeTakeFirst();

	return ai.Preferences.safeParse(row?.data).data?.instructions?.trim() || undefined;
}

function systemPrompt(prompt: string | null | undefined, instructions: string | undefined): string {
	const now = new Date();
	const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

	const sections = [prompt ?? getConfig('@axium/ai').system_prompt];
	sections.push(`Today is ${date}.`);
	if (instructions) sections.push(`The user has given these instructions for every conversation:\n\n${instructions}`);

	return sections.join('\n\n');
}

function toChatMessage(row: MessageRow): ChatMessage {
	switch (row.role) {
		case 'user':
			return { role: 'user', content: row.content };
		case 'tool':
			return { role: 'tool', tool_call_id: row.toolCallId!, content: row.content };
		default: {
			const toolCalls = row.toolCalls as ai.ToolCall[] | null;
			return {
				role: 'assistant',
				content: row.content || null,
				tool_calls: toolCalls?.map(call => ({
					id: call.id,
					type: 'function',
					function: { name: call.name, arguments: call.arguments },
				})),
			};
		}
	}
}

async function history(conversationId: string, exclude: string): Promise<ChatMessage[]> {
	const rows = await database
		.selectFrom('ai_messages')
		.selectAll()
		.where('conversationId', '=', conversationId)
		.where('id', '!=', exclude)
		.where('status', '!=', 'error')
		.orderBy('created')
		.execute();

	return rows.filter(row => row.content || row.toolCalls).map(toChatMessage);
}

interface Outcome extends Pick<ai.Message, 'content' | 'reasoning' | 'status'> {
	error: string | null;
	usage: ai.Usage | null;
}

interface ResponseInit {
	userId: string;
	conversationId: string;
	messageId: string;
	/** `null` uses the default model */
	model: string | null;
	reasoning: string;
	/** The conversation so far, without the system prompt */
	history(): Promise<ChatMessage[]>;
	/** Saves or sends the finished response; `model` is missing when none was available */
	finish(outcome: Outcome, model?: string): Promise<void> | void;
}

/** Streams a response, sending its text to the user as it arrives. Never throws. */
async function respond(init: ResponseInit): Promise<void> {
	const config = getConfig('@axium/ai');
	const controller = new AbortController();
	const generation: Generation = { controller, userId: init.userId, messageId: init.messageId, content: '', reasoning: '' };
	active.set(init.conversationId, generation);

	let streaming = false;
	let model: string | undefined;
	let outcome: Outcome;

	function append(field: 'content' | 'reasoning', text: string): void {
		const position = generation[field].length;
		generation[field] += text;
		socketServer
			?.to('user:' + init.userId)
			.emit('ai.delta', { conversationId: init.conversationId, messageId: init.messageId, field, text, position });

		if (streaming || !model) return;
		streaming = true;
		void learnCapabilities(model);
	}

	try {
		model = init.model ?? (await getDefaultModel());
		const settings = model && (await getRow(model));
		if (!model || !settings) throw new Error('No model is available');

		const system = systemPrompt(settings.systemPrompt, await userInstructions(init.userId));

		const result = await chat({
			model,
			messages: [{ role: 'system', content: system }, ...(await init.history())],
			reasoning: init.reasoning == 'default' ? (settings.reasoning ?? 'default') : init.reasoning,
			signal: AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeout * 1000)]),
			onContent: text => append('content', text),
			onReasoning: text => append('reasoning', text),
		});

		outcome = { content: result.content, reasoning: result.reasoning || null, status: 'done', error: null, usage: result.usage };
	} catch (error) {
		const cancelled = controller.signal.aborted;
		if (!cancelled) io.warn(`AI: response in ${init.conversationId} failed: ${io.errorText(error)}`);
		outcome = {
			content: generation.content,
			reasoning: generation.reasoning || null,
			status: cancelled ? 'cancelled' : 'error',
			error: cancelled ? null : error instanceof Error && error.name == 'TimeoutError' ? 'Timed out' : io.errorText(error),
			usage: null,
		};
	}

	try {
		await init.finish(outcome, model);
	} catch (error) {
		io.error(`AI: could not finish response ${init.messageId}: ${io.errorText(error)}`);
	} finally {
		active.delete(init.conversationId);
	}
}

/** Streams a response into the pending `message`. Never throws. */
export async function generate(conversation: ConversationRow, message: MessageRow): Promise<void> {
	await respond({
		userId: conversation.userId,
		conversationId: conversation.id,
		messageId: message.id,
		model: conversation.model,
		reasoning: conversation.reasoning,
		history: () => history(conversation.id, message.id),
		async finish({ usage, ...outcome }, model) {
			const updated = await database
				.updateTable('ai_messages')
				.set({ ...outcome, usage: usage ? JSON.stringify(usage) : null })
				.where('id', '=', message.id)
				.returningAll()
				.executeTakeFirstOrThrow();

			emitMessage(conversation.userId, toMessage(updated));

			if (outcome.status == 'done' && model) void nameConversation(conversation, model, outcome.content);
		},
	});
}

/** Streams a response for a temporary conversation, which is never saved. Never throws. */
export async function generateTemporary(userId: string, init: ai.TemporaryInit, pending: ai.Message): Promise<void> {
	await respond({
		userId,
		conversationId: pending.conversationId,
		messageId: pending.id,
		model: init.model ?? null,
		reasoning: init.reasoning,
		history: () => Promise.resolve(init.messages),
		finish: outcome => emitMessage(userId, { ...pending, ...outcome }),
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

/** Marks responses left pending by a previous process as failed */
export async function failInterrupted(): Promise<void> {
	await database
		.updateTable('ai_messages')
		.set({ status: 'error', error: 'Interrupted by a server restart' })
		.where('status', '=', 'pending')
		.execute();
}
