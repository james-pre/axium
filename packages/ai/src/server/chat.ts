import type { AIEndpoint, AIToolCall, AIUsage } from '../common.js';

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

function headers(endpoint: AIEndpoint): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (endpoint.key) headers.Authorization = 'Bearer ' + endpoint.key;
	return headers;
}

async function* serverSentEvents(response: Response): AsyncGenerator<any> {
	let buffer = '';
	for await (const chunk of response.body!.pipeThrough(new TextDecoderStream())) {
		buffer += chunk;
		const lines = buffer.split('\n');
		buffer = lines.pop()!;
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim();
			if (data == '[DONE]') return;
			yield JSON.parse(data);
		}
	}
}

export async function chat(endpoint: AIEndpoint, request: ChatRequest): Promise<ChatResult> {
	const response = await fetch(new URL('v1/chat/completions', endpoint.url), {
		method: 'POST',
		headers: headers(endpoint),
		signal: request.signal,
		body: JSON.stringify({
			model: request.model,
			messages: request.messages,
			reasoning_effort: request.reasoning == 'default' ? undefined : request.reasoning,
			stream: true,
			stream_options: { include_usage: true },
		}),
	});

	if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);

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

export interface EndpointModel {
	id: string;
	loaded?: boolean;
}

export async function listModels(endpoint: AIEndpoint, signal?: AbortSignal): Promise<EndpointModel[]> {
	const response = await fetch(new URL('v1/models', endpoint.url), { headers: headers(endpoint), signal });
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

	const { data } = (await response.json()) as { data: { id: string; status?: { value: string } }[] };

	return data.map(model => ({ id: model.id, loaded: model.status && model.status.value == 'loaded' }));
}

/**
 * The reasoning levels a loaded model's chat template distinguishes, lowest to highest.
 * Only llama-server reports these, and only while the model is loaded; this never loads it.
 */
export async function getReasoningLevels(endpoint: AIEndpoint, model: string, signal?: AbortSignal): Promise<string[] | undefined> {
	const url = new URL('props', endpoint.url);
	url.searchParams.set('model', model);
	url.searchParams.set('autoload', 'false');

	const response = await fetch(url, { headers: headers(endpoint), signal });
	if (!response.ok) return;

	const props = (await response.json()) as { chat_template_caps?: { reasoning_effort_levels?: string[] } | null };
	return props.chat_template_caps?.reasoning_effort_levels;
}

/** The prompt a loaded llama-server model would see, without running it */
async function renderPrompt(endpoint: AIEndpoint, model: string, reasoning?: string, signal?: AbortSignal): Promise<string | undefined> {
	const response = await fetch(new URL('apply-template?autoload=false', endpoint.url), {
		method: 'POST',
		headers: headers(endpoint),
		signal,
		body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }], reasoning_effort: reasoning }),
	});
	if (!response.ok) return;

	const { prompt } = (await response.json()) as { prompt?: string };
	return prompt;
}

/**
 * Which of `candidates` a loaded llama-server model's chat template uses when no reasoning effort is given,
 * found by comparing rendered prompts.
 */
export async function getDefaultReasoning(
	endpoint: AIEndpoint,
	model: string,
	candidates: string[],
	signal?: AbortSignal
): Promise<string | undefined> {
	const base = await renderPrompt(endpoint, model, undefined, signal);
	if (base === undefined) return;

	for (const candidate of candidates) {
		if ((await renderPrompt(endpoint, model, candidate, signal)) === base) return candidate;
	}
}
