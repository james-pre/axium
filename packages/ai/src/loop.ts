import * as io from 'ioium';
import type * as ai from './common.js';
import { memoryPrompt } from './memory.js';
import type { ChatMessage, ChatRequest, ChatStream } from './node/chat.js';
import * as tools from './tools.js';

export type MessageChanges = Partial<Omit<ai.Message, 'id' | 'conversationId' | 'created'>>;

/** Where a conversation's messages are kept. Changes should reach the user. */
export interface Store {
	userId: string;
	conversationId: string;
	add(message: MessageChanges & Pick<ai.Message, 'role'>): Promise<ai.Message>;
	update(id: string, changes: MessageChanges): Promise<ai.Message>;
}

/** The text streamed into the message being generated, which is only saved once it ends */
export interface Progress {
	messageId: string;
	content: string;
	reasoning: string;
}

/** What the loop needs to know about the model */
export interface ModelSettings extends Pick<ai.ModelInfo, 'id' | 'systemPrompt' | 'reasoning' | 'tools'> {}

export interface TurnInit {
	store: Store;
	model: ModelSettings;
	/** The conversation's reasoning setting */
	reasoning: string;
	/** Used when the model has no system prompt */
	defaultSystemPrompt: string;
	/** Calls with more steps than this get no tools, so the model has to answer */
	maxSteps: number;
	/** Runs a chat completion with the model */
	complete(request: Omit<ChatRequest, 'model'>): ChatStream;
	preferences: ai.Preferences;
	/** The user's memories, or nothing when they shouldn't be used */
	memories?: ai.Memory[];
	/** Tools act with this; its signal also cancels the turn */
	context: tools.Context;
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
	/** Saves tools the user allowed in every conversation */
	allowAlways?(names: string[]): Promise<void>;
	/** Leaves out tools that use the user's data */
	anonymous?: boolean;
	/** For conversations that are never saved, which never save memories */
	temporary?: boolean;
	/** Kept up to date with the text being streamed */
	progress: Progress;
	/** Called with each piece of streamed text, after `progress` is updated */
	onText?(field: 'content' | 'reasoning', text: string, position: number): void;
	/** Called after the turn's final response */
	onDone?(content: string): void;
}

const toolGuidance =
	'You can call tools. Only call one when it helps with what the user asked. ' +
	'If a call fails, read the error and correct the input instead of repeating the same call. ' +
	"Never create, change or delete anything the user didn't ask for, even as a workaround. " +
	'Only say an action was done when a tool result confirms it; if you could not do something, say so.';

interface PromptParts {
	prompt: string;
	instructions?: string;
	offered: tools.Tool[];
	/** The section about what the model remembers */
	memory?: string;
}

function systemPrompt({ prompt, instructions, offered, memory }: PromptParts): string {
	const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

	const sections = [prompt, `Today is ${date}.`];
	if (offered.length) sections.push(toolGuidance);
	if (memory) sections.push(memory);
	if (instructions) sections.push(`The user has given these instructions for every conversation:\n\n${instructions}`);

	return sections.join('\n\n');
}

/** A message as the model sees it, or nothing for messages it shouldn't see */
export function toChatMessage(message: ai.Message): ChatMessage | undefined {
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

const repeatedFailure: tools.CallResult = {
	status: 'error',
	content: 'Error: this exact call already failed. Change the input or answer without it.',
	error: 'Repeated a failed call',
};

/**
 * Runs or denies the tool calls in `history` that await the user, replacing them with the results.
 * Tools the user allowed beyond this call are added to `allowed` and saved.
 */
async function resolveAwaiting(history: ai.Message[], init: TurnInit, allowed: Set<string>): Promise<void> {
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

		history[index] = await init.store.update(message.id, await tools.run(tools.get(call.name), call, init.context));
	}

	for (const name of forChat) allowed.add(name);
	if (forChat.size) await init.allowForChat?.([...allowed]);
	if (always.size) await init.allowAlways?.([...always]);
}

/** Anything more than this is probably a bug. */
const stepUpperBound = 1000;

/**
 * Responds to a conversation, calling tools until the model gives a final answer or a call needs the user's approval.
 * Never throws: failures are saved on the messages they affect.
 */
export async function respond(init: TurnInit): Promise<void> {
	const { store, model, preferences, context, progress } = init;
	const { signal } = context;

	/** The assistant message being streamed into, until it finishes */
	let pending: ai.Message | null = init.pending;
	/** Tool messages whose calls are running */
	const running = new Set<string>();

	function append(field: 'content' | 'reasoning', text: string): void {
		const position = progress[field].length;
		progress[field] += text;
		init.onText?.(field, text, position);
	}

	try {
		const offered =
			model.tools === false ? [] : tools.allowed(preferences.tools, { anonymous: init.anonymous, temporary: init.temporary });
		const definitions = tools.definitions(offered);

		const memory =
			init.memories &&
			memoryPrompt(
				init.memories,
				offered.some(tool => tool.environment == 'memory' && tool.access == 'write')
			);

		const allowed = new Set(init.allowedTools);
		const history = await init.history();
		await resolveAwaiting(history, init, allowed);

		const messages: ChatMessage[] = [
			{
				role: 'system',
				content: systemPrompt({
					prompt: model.systemPrompt ?? init.defaultSystemPrompt,
					instructions: preferences.instructions?.trim(),
					offered,
					memory,
				}),
			},
			...history.map(toChatMessage).filter(message => !!message),
		];

		/** Calls that failed, by name and arguments */
		const failed = new Set<string>();

		for (let step = 1; step < stepUpperBound; step++) {
			const stream = init.complete({
				messages,
				reasoning: init.reasoning == 'default' ? (model.reasoning ?? 'default') : init.reasoning,
				tools: step < init.maxSteps ? definitions : undefined,
				signal,
			});

			let chunk = await stream.next();
			for (; !chunk.done; chunk = await stream.next()) append(chunk.value.field, chunk.value.text);
			const result = chunk.value;

			const calls = result.toolCalls
				.filter(call => call.name)
				.map(call => ({ ...call, id: call.id || 'call_' + crypto.randomUUID() }));

			const finished: ai.Message = await store.update(pending.id, {
				content: result.content,
				reasoning: result.reasoning || null,
				toolCalls: calls.length ? calls : null,
				status: 'done',
				usage: result.usage,
			});
			pending = null;

			if (!calls.length) {
				init.onDone?.(result.content);
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
			Object.assign(progress, { messageId: pending.id, content: '', reasoning: '' });
		}
	} catch (error) {
		const isTimeout = (value: unknown) => value instanceof Error && value.name == 'TimeoutError';
		const timedOut = isTimeout(signal.reason) || isTimeout(error);
		const cancelled = signal.aborted && !timedOut;
		if (!cancelled) io.warn(`AI: response in ${store.conversationId} failed: ${io.errorText(error)}`);
		const reason = cancelled ? null : timedOut ? 'Timed out' : io.errorText(error);

		try {
			for (const id of running) await store.update(id, { status: cancelled ? 'cancelled' : 'error', error: reason });
			if (pending) {
				await store.update(pending.id, {
					content: progress.content,
					reasoning: progress.reasoning || null,
					status: cancelled ? 'cancelled' : 'error',
					error: reason,
				});
			}
		} catch (error) {
			io.error(`AI: could not finish response in ${store.conversationId}: ${io.errorText(error)}`);
		}
	}
}
