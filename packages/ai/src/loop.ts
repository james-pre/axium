import * as io from 'ioium';
import type * as ai from './common.js';
import * as memory from './memory.js';
import './tools/sandbox.js';
import './tools/timers.js';
import type { ChatMessage, ChatRequest, ChatStream } from './node/chat.js';
import * as tools from './tools.js';
import { bytes as formatBytes } from 'utilium/format';

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
export interface ModelSettings extends Pick<ai.ModelInfo, 'id' | 'systemPrompt' | 'reasoning' | 'tools'>, Pick<ai.Model, 'inputs'> {}

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
	memories?: memory.Node[];
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
	/** Kept up to date with the text being streamed */
	progress: Progress;
	/** Called with each piece of streamed text, after `progress` is updated */
	onText?(field: 'content' | 'reasoning', text: string, position: number): void;
	/** Called after the turn's final response */
	onDone?(content: string): void;
	/** The time zone of the user's device. Defaults to UTC. */
	timeZone?: string;
	/** The user's home time zone, when they have one */
	homeTimeZone?: string;
}

const toolGuidance = `\
You can call tools. Only call one when it helps with what the user asked.\
 If a call fails, read the error and correct the input instead of repeating the same call.\
 Never create, change or delete anything the user didn't ask for, even as a workaround.\
 Only say an action was done when a tool result confirms it; if you could not do something, say so.\
 Results you report, such as numbers, file contents or decoded text, must come from a tool result; never guess them, and say so plainly when your tools could not produce them.`;

const voiceGuidance = `\
The user is speaking to you, and your reply will be read aloud by a speech synthesizer, so write only what should be heard.\
 Reply in plain spoken prose: no Markdown, lists, tables, headings, code, emoji, URLs or symbols that would be read out literally.\
 Be brief and conversational, usually one to three sentences.\
 Write numbers, dates, times and units the way they are said aloud, e.g. "twenty past three" and "about four kilometres".\
 Don't read out IDs, links, file paths or long values; describe them, or say the details are in the chat.\
 Only state facts you are sure of or that a tool result gave you; if you don't know, say so briefly.\
 The transcript of what the user said may contain recognition mistakes, so read it for its likely meaning`;

interface PromptParts {
	prompt: string;
	instructions?: string;
	offered: tools.Tool[];
	/** The section about what the model remembers */
	remembered?: string;
	/** Whether the reply will be read aloud */
	voice?: boolean;
	timeZone: string;
	homeTimeZone?: string;
	/** What the sandbox can reach, when sandbox tools are offered */
	sandboxNetwork?: ai.SandboxNetwork;
}

const sandboxNetworkGuidance: Record<ai.SandboxNetwork, string> = {
	none: 'The sandbox has no internet access, so only what is already installed can be used (see `pip list`). If a task needs more, tell the user they can allow package registries in their AI preferences.',
	packages:
		'The sandbox can reach package registries (pip, npm and similar) but no other sites, so install what a task needs, e.g. with `pip install`.',
	all: 'The sandbox can reach public internet sites, including package registries, so install what a task needs, e.g. with `pip install`.',
};

/** Added to the last tool result the model sees before it must answer without tools */
const lastStepNote = `\n\n[This was the last tool call allowed for this turn. Answer the user now from the tool results above:\
 say what you found and what is unfinished, and never present a result you don't have. The user can ask you to continue.]`;

/** When a message was sent, e.g. `<sent>Monday 2026-11-16T21:15-06:00 (2026-11-17T03:15Z)</sent>` */
function sentTag(created: Date, timeZone: string): string {
	const instant = created.toTemporalInstant();
	const local = instant.toZonedDateTimeISO(timeZone);
	const weekday = local.toLocaleString('en-US', { weekday: 'long' });
	const localText = local.toString({ smallestUnit: 'minute', timeZoneName: 'never' });
	return `<sent>${weekday} ${localText} (${instant.toString({ smallestUnit: 'minute' })})</sent>`;
}

function systemPrompt({ prompt, instructions, offered, remembered, voice, timeZone, homeTimeZone, sandboxNetwork }: PromptParts): string {
	const sections = [prompt];

	// date information

	const local = Temporal.Now.zonedDateTimeISO(timeZone);
	const date = local.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

	sections.push(
		`For the user, today is ${date}. Their time zone is ${timeZone} (UTC${local.offset}).\
${homeTimeZone && homeTimeZone != timeZone ? ` Their home time zone is ${homeTimeZone}.` : ''}\
 Each of the user's messages starts with a <sent> tag saying when it was sent,\
 in their time and UTC; the latest one is the current time.\
 The tag isn't part of what they wrote, so don't repeat it.`
	);

	if (offered.length) sections.push(toolGuidance);
	if (sandboxNetwork) sections.push(sandboxNetworkGuidance[sandboxNetwork]);
	if (remembered) sections.push(remembered);
	if (voice) sections.push(voiceGuidance);
	if (instructions) sections.push(`The user has given these instructions for every conversation:\n\n${instructions}`);

	return sections.join('\n\n');
}

/**
 * A message as the model sees it, or nothing for messages it shouldn't see
 * @param timeZone Used for when user messages were sent
 */
export function toChatMessage(message: ai.Message, timeZone: string = 'UTC'): ChatMessage | undefined {
	switch (message.role) {
		case 'user': {
			const tags = [sentTag(message.created, timeZone)];
			if (message.attachments?.length)
				tags.push(
					`<attachments>${message.attachments.map(file => `${file.path} (${formatBytes(file.size)})`).join(', ')}</attachments>`
				);
			return { role: 'user', content: `${tags.join('\n')}\n${message.content}` };
		}
		case 'system':
			return { role: 'user', content: `<system-reminder>\n${message.content}\n</system-reminder>` };
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

/** The conversation as the model sees it, with system messages joined to the user message after them */
function chatHistory(history: ai.Message[], timeZone: string): ChatMessage[] {
	const messages: ChatMessage[] = [];
	let reminders: string[] = [];

	for (const message of history) {
		const chat = toChatMessage(message, timeZone);
		if (!chat) continue;

		if (message.role == 'system' && chat.role == 'user') {
			reminders.push(chat.content);
			continue;
		}

		if (reminders.length && chat.role == 'user') chat.content = [...reminders, chat.content].join('\n');
		else if (reminders.length) messages.push({ role: 'user', content: reminders.join('\n') });
		reminders = [];
		messages.push(chat);
	}

	if (reminders.length) messages.push({ role: 'user', content: reminders.join('\n') });
	return messages;
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

export interface RequestInit extends Pick<
	TurnInit,
	'model' | 'reasoning' | 'defaultSystemPrompt' | 'preferences' | 'memories' | 'anonymous' | 'timeZone' | 'homeTimeZone'
> {
	/** Only whether there is a sandbox matters */
	context: Pick<tools.Context, 'sandbox'>;
	/** The conversation so far, oldest first */
	history: ai.Message[];
}

/** What a turn sends to the model before it calls any tools */
export interface TurnRequest {
	/** Starting with the system message */
	messages: ChatMessage[];
	tools: ReturnType<typeof tools.definitions>;
	reasoning: string;
}

/** Builds the request a turn starts with, which is also what the context view measures */
export function createRequest(init: RequestInit): TurnRequest {
	const { model, preferences, context, history } = init;

	const offered =
		model.tools === false
			? []
			: tools.allowed(preferences.tools, {
					anonymous: init.anonymous,
					sandbox: !!context.sandbox,
					inputs: model.inputs,
				});

	const remembered =
		init.memories &&
		memory.prompt(
			init.memories,
			offered.some(tool => tool.environment == 'memory' && tool.access == 'write')
		);

	const spoken = !!history.findLast(message => message.role == 'user')?.voice;
	const timeZone = init.timeZone ?? 'UTC';

	const system = systemPrompt({
		prompt: model.systemPrompt ?? init.defaultSystemPrompt,
		instructions: preferences.instructions?.trim(),
		offered,
		remembered,
		voice: spoken,
		timeZone,
		homeTimeZone: init.homeTimeZone,
		sandboxNetwork: offered.some(tool => tool.environment == 'sandbox') ? context.sandbox?.network : undefined,
	});

	return {
		messages: [{ role: 'system', content: system }, ...chatHistory(history, timeZone)],
		tools: tools.definitions(offered),
		reasoning: spoken ? 'none' : init.reasoning == 'default' ? (model.reasoning ?? 'default') : init.reasoning,
	};
}

/** Adds images a tool showed to its result, for the rest of the turn */
function withImages(message: ChatMessage, images?: tools.Image[]): ChatMessage {
	if (message.role != 'tool' || !images?.length) return message;
	return {
		...message,
		content: [
			{ type: 'text', text: typeof message.content == 'string' ? message.content : '' },
			...images.map(image => ({
				type: 'image_url' as const,
				image_url: { url: `data:${image.type};base64,${image.data.toBase64()}` },
			})),
		],
	};
}

/** Anything more than this is probably a bug. */
const stepUpperBound = 1000;

/**
 * Responds to a conversation, calling tools until the model gives a final answer or a call needs the user's approval.
 * Never throws: failures are saved on the messages they affect.
 */
export async function respond(init: TurnInit): Promise<void> {
	const { store, preferences, context, progress } = init;
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
		const allowed = new Set(init.allowedTools);
		const history = await init.history();
		await resolveAwaiting(history, init, allowed);

		const { messages, tools: definitions, reasoning } = createRequest({ ...init, history });

		/** Calls that failed, by name and arguments */
		const failed = new Set<string>();

		for (let step = 1; step < stepUpperBound; step++) {
			const stream = init.complete({
				messages,
				reasoning,
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
				const { images, ...outcome } = failed.has(key) ? repeatedFailure : await tools.run(tool, call, context);
				if (outcome.status == 'error') failed.add(key);

				const done = await store.update(message.id, signal.aborted ? { status: 'cancelled' } : outcome);
				running.delete(message.id);
				messages.push(withImages(toChatMessage(done)!, signal.aborted ? undefined : images));
			}

			const last = messages.at(-1);
			if (step + 1 >= init.maxSteps && last?.role == 'tool') {
				if (typeof last.content == 'string') last.content += lastStepNote;
				else last.content.push({ type: 'text', text: lastStepNote });
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
