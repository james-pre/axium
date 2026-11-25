import type * as ai from '../common.js';
import type { TurnRequest } from '../loop.js';
import { countTokens, type ChatMessage } from './chat.js';

export interface Measurement {
	/** Tokens in the whole request */
	used: number;
	parts: Partial<Record<ai.ContextPart, number>>;
}

/**
 * Counts what each part of a request takes up, by counting the request again with that part emptied.
 * Whatever no part accounts for is the chat template's own formatting.
 */
export async function measure(model: string, request: TurnRequest, signal?: AbortSignal): Promise<Measurement> {
	const count = (messages: ChatMessage[], tools = request.tools) =>
		countTokens({ model, messages, tools, reasoning: request.reasoning, signal });

	const emptied = (change: (message: ChatMessage) => ChatMessage) => request.messages.map(change);

	const variants: [ai.ContextPart, () => Promise<number>][] = [
		['system', () => count(emptied(message => (message.role == 'system' ? { ...message, content: '' } : message)))],
		['tools', () => count(request.messages, [])],
		['user', () => count(emptied(message => (message.role == 'user' ? { ...message, content: '' } : message)))],
		[
			'assistant',
			() => count(emptied(message => (message.role == 'assistant' && message.content ? { ...message, content: '' } : message))),
		],
		[
			'tool_calls',
			() =>
				count(
					emptied(message =>
						message.role == 'assistant' && message.tool_calls
							? {
									...message,
									tool_calls: message.tool_calls.map(call => ({
										...call,
										function: { ...call.function, arguments: '{}' },
									})),
								}
							: message
					)
				),
		],
		['tool_results', () => count(emptied(message => (message.role == 'tool' ? { ...message, content: '' } : message)))],
	];

	const used = await count(request.messages);
	const results = await Promise.allSettled(variants.map(([, run]) => run()));

	const parts: Partial<Record<ai.ContextPart, number>> = {};
	for (const [index, result] of results.entries()) {
		if (result.status != 'fulfilled') continue;
		const tokens = used - result.value;
		if (tokens > 0) parts[variants[index][0]] = tokens;
	}

	const accounted = Object.values(parts).reduce((sum, tokens) => sum + tokens, 0);
	if (used > accounted) parts.other = used - accounted;

	return { used, parts };
}
