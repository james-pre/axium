import type { AIToolCall, AIUsage } from '../common.js';
import { request as llamaRequest, serverSentEvents } from './llama.js';

/** A message in the OpenAI chat completions format */
export type ChatMessage =
	| { role: 'system' | 'user'; content: string }
	| {
			role: 'assistant';
			content: string | null;
			tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
	  }
	| { role: 'tool'; tool_call_id: string; content: string };

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	/** Sent as `reasoning_effort`, except for `default` */
	reasoning: string;
	maxTokens?: number;
	signal?: AbortSignal;
	onContent?(text: string): void;
	onReasoning?(text: string): void;
}

export interface ChatResult {
	content: string;
	reasoning: string;
	toolCalls: AIToolCall[];
	finishReason: string | null;
	usage: AIUsage | null;
}

export async function chat(request: ChatRequest): Promise<ChatResult> {
	const response = await llamaRequest('v1/chat/completions', {
		method: 'POST',
		signal: request.signal,
		body: JSON.stringify({
			model: request.model,
			messages: request.messages,
			reasoning_effort: request.reasoning == 'default' ? undefined : request.reasoning,
			max_tokens: request.maxTokens,
			stream: true,
			stream_options: { include_usage: true },
		}),
	});

	const result: ChatResult = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };

	for await (const event of serverSentEvents(response)) {
		if (event.usage) {
			result.usage = {
				promptTokens: event.usage.prompt_tokens,
				completionTokens: event.usage.completion_tokens,
				promptSpeed: event.timings?.prompt_per_second,
				generationSpeed: event.timings?.predicted_per_second,
			};
		}

		const choice = event.choices?.[0];
		if (!choice) continue;
		if (choice.finish_reason) result.finishReason = choice.finish_reason;

		const delta = choice.delta ?? {};
		if (delta.reasoning_content) {
			result.reasoning += delta.reasoning_content;
			request.onReasoning?.(delta.reasoning_content);
		}
		if (delta.content) {
			result.content += delta.content;
			request.onContent?.(delta.content);
		}
		for (const part of delta.tool_calls ?? []) {
			const call = (result.toolCalls[part.index] ??= { id: '', name: '', arguments: '' });
			if (part.id) call.id = part.id;
			if (part.function?.name) call.name += part.function.name;
			if (part.function?.arguments) call.arguments += part.function.arguments;
		}
	}

	return result;
}
