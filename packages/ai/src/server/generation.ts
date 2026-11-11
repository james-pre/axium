import { getConfig } from '@axium/core';
import { database, type Schema } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium';
import type { Selectable } from 'kysely';
import type schema from '../../db.json';
import type { AIMessage, AIToolCall, AIUsage } from '../common.js';
import { parseModelId } from '../common.js';
import { chat, type ChatMessage } from './chat.js';
import { learnCapabilities } from './models.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

type MessageRow = Selectable<Schema['ai_messages']>;
type ConversationRow = Selectable<Schema['ai_conversations']>;

export function toMessage(row: MessageRow): AIMessage {
	return {
		...row,
		toolCalls: row.toolCalls as AIToolCall[] | null,
		usage: row.usage as AIUsage | null,
	} as AIMessage;
}

export function emitMessage(userId: string, message: AIMessage): void {
	socketServer?.to('user:' + userId).emit('ai.message', message);
}

interface Generation {
	controller: AbortController;
	messageId: string;
	content: string;
	reasoning: string;
}

/** Running responses, by conversation ID */
const active = new Map<string, Generation>();

export function isGenerating(conversationId: string): boolean {
	return active.has(conversationId);
}

export function cancel(conversationId: string): boolean {
	const generation = active.get(conversationId);
	generation?.controller.abort();
	return !!generation;
}

/** Fills in the text streamed so far, which is only saved once the response ends */
export function withProgress(message: AIMessage): AIMessage {
	const generation = active.get(message.conversationId);
	if (message.status != 'pending' || generation?.messageId != message.id) return message;
	return { ...message, content: generation.content, reasoning: generation.reasoning || null };
}

function systemPrompt(): string {
	const now = new Date();
	const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	return `${getConfig('@axium/ai').system_prompt}\n\nToday is ${date}.`;
}

function toChatMessage(row: MessageRow): ChatMessage {
	switch (row.role) {
		case 'user':
			return { role: 'user', content: row.content };
		case 'tool':
			return { role: 'tool', tool_call_id: row.toolCallId!, content: row.content };
		default: {
			const toolCalls = row.toolCalls as AIToolCall[] | null;
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

	return [{ role: 'system', content: systemPrompt() }, ...rows.filter(row => row.content || row.toolCalls).map(toChatMessage)];
}

interface Outcome extends Pick<AIMessage, 'content' | 'reasoning' | 'status'> {
	error?: string | null;
	usage?: AIUsage | null;
}

async function finish(row: MessageRow, { usage, ...outcome }: Outcome, userId: string) {
	const updated = await database
		.updateTable('ai_messages')
		.set({ ...outcome, usage: usage ? JSON.stringify(usage) : null })
		.where('id', '=', row.id)
		.returningAll()
		.executeTakeFirstOrThrow();

	emitMessage(userId, toMessage(updated));
}

/** Streams a response into the pending `message`. Never throws. */
export async function generate(conversation: ConversationRow, message: MessageRow): Promise<void> {
	const config = getConfig('@axium/ai');
	const { endpoint: endpointName, model } = parseModelId(conversation.model);
	const controller = new AbortController();
	const generation: Generation = { controller, messageId: message.id, content: '', reasoning: '' };
	active.set(conversation.id, generation);

	let streaming = false;

	function append(field: 'content' | 'reasoning', text: string): void {
		const position = generation[field].length;
		generation[field] += text;
		socketServer
			?.to('user:' + conversation.userId)
			.emit('ai.delta', { conversationId: conversation.id, messageId: message.id, field, text, position });

		if (streaming) return;
		streaming = true;
		void learnCapabilities(conversation.model);
	}

	try {
		const endpoint = config.endpoints[endpointName];
		if (!endpoint) throw new Error(`The endpoint "${endpointName}" is not configured`);

		const result = await chat(endpoint, {
			model,
			messages: await history(conversation.id, message.id),
			reasoning: conversation.reasoning,
			signal: AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeout * 1000)]),
			onContent: text => append('content', text),
			onReasoning: text => append('reasoning', text),
		});

		await finish(
			message,
			{ content: result.content, reasoning: result.reasoning || null, status: 'done', usage: result.usage },
			conversation.userId
		);
	} catch (error) {
		const cancelled = controller.signal.aborted;
		if (!cancelled) io.warn(`AI: response in ${conversation.id} failed: ${io.errorText(error)}`);
		await finish(
			message,
			{
				content: generation.content,
				reasoning: generation.reasoning || null,
				status: cancelled ? 'cancelled' : 'error',
				error: cancelled ? null : error instanceof Error && error.name == 'TimeoutError' ? 'Timed out' : io.errorText(error),
			},
			conversation.userId
		).catch(error => io.error(`AI: could not save response ${message.id}: ${io.errorText(error)}`));
	} finally {
		active.delete(conversation.id);
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
