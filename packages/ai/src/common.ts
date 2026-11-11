import { $API, serverConfigs } from '@axium/core';
import { addServerToClient, type ParseFunctions } from '@axium/core/socket';
import * as z from 'zod';

export const AIEndpointName = z.string().regex(/^[\w-]+$/, 'Endpoint names may only contain letters, numbers, "_", and "-"');

/** An OpenAI-compatible server, e.g. llama-server */
export const AIEndpoint = z.object({
	/** Base URL, without the trailing `/v1` */
	url: z.url(),
	/** Sent as a bearer token */
	key: z.string().optional(),
});
export interface AIEndpoint extends z.infer<typeof AIEndpoint> {}

/** `<endpoint>/<model>` */
export const AIModelId = z.string().regex(/^[\w-]+\/.+$/, 'Model IDs have the form <endpoint>/<model>');

// @todo use this if it doesn't mess up the server types
// export const AIModelId = z.templateLiteral([AIEndpointName, z.literal('/'), z.string().min(1)]);

export function parseModelId(id: string): { endpoint: string; model: string } {
	const index = id.indexOf('/');
	return { endpoint: id.slice(0, index), model: id.slice(index + 1) };
}

export const AIConfig = z
	.object({
		endpoints: z.record(AIEndpointName, AIEndpoint),
		/** Used for new conversations */
		default_model: AIModelId.optional(),
		/** Prepended to every conversation, followed by the current date */
		system_prompt: z.string(),
		/** Seconds a single response may take before it is stopped */
		timeout: z.number().positive(),
	})
	.refine(config => !config.default_model || parseModelId(config.default_model).endpoint in config.endpoints, {
		error: 'The default model must use a configured endpoint',
		path: ['default_model'],
	});
export interface AIConfig extends z.infer<typeof AIConfig> {}

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/ai': AIConfig;
	}
}

serverConfigs.set('@axium/ai', AIConfig);

/** `default` uses the model's default, `none` disables reasoning, anything else is a level such as `low` or `high` */
export const AIReasoning = z
	.string()
	.regex(/^[a-z]+$/)
	.max(16);

export const AIModel = z.object({
	id: AIModelId,
	endpoint: AIEndpointName,
	name: z.string(),
	/** Whether the model is in memory, when the endpoint reports it */
	loaded: z.boolean().optional(),
	/** Reasoning levels the model distinguishes, lowest to highest. Empty when it only has on and off; missing when not known yet. */
	reasoningLevels: AIReasoning.array().optional(),
	/** What `default` amounts to: `none` or one of the levels. Missing when not known. */
	defaultReasoning: AIReasoning.optional(),
});
export interface AIModel extends z.infer<typeof AIModel> {}

export const AIModels = z.object({
	models: AIModel.array(),
	default: AIModelId.optional(),
});
export interface AIModels extends z.infer<typeof AIModels> {}

export const AIConversationInit = z.object({
	title: z.string().max(200).optional(),
	model: AIModelId.optional(),
	reasoning: AIReasoning.optional(),
});
export type AIConversationInit = z.infer<typeof AIConversationInit>;

export const AIConversation = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	title: z.string(),
	model: AIModelId,
	reasoning: AIReasoning,
	created: z.coerce.date(),
	modified: z.coerce.date(),
});
export interface AIConversation extends z.infer<typeof AIConversation> {}

export const AIMessageRole = z.literal(['user', 'assistant', 'tool']);
export type AIMessageRole = z.infer<typeof AIMessageRole>;

export const AIMessageStatus = z.literal(['pending', 'done', 'error', 'cancelled']);
export type AIMessageStatus = z.infer<typeof AIMessageStatus>;

export const AIToolCall = z.object({
	id: z.string(),
	name: z.string(),
	/** JSON, as produced by the model */
	arguments: z.string(),
});
export interface AIToolCall extends z.infer<typeof AIToolCall> {}

export const AIUsage = z.object({
	promptTokens: z.int().nonnegative(),
	completionTokens: z.int().nonnegative(),
	/** Tokens per second */
	promptSpeed: z.number().optional(),
	/** Tokens per second */
	generationSpeed: z.number().optional(),
});
export interface AIUsage extends z.infer<typeof AIUsage> {}

export const AIMessage = z.object({
	id: z.uuid(),
	conversationId: z.uuid(),
	created: z.coerce.date(),
	role: AIMessageRole,
	content: z.string(),
	reasoning: z.string().nullable(),
	toolCalls: AIToolCall.array().nullable(),
	toolCallId: z.string().nullable(),
	status: AIMessageStatus,
	error: z.string().nullable(),
	usage: AIUsage.nullable(),
});
export interface AIMessage extends z.infer<typeof AIMessage> {}

export const AIMessageInit = z.object({
	content: z.string().trim().min(1).max(100_000),
});
export type AIMessageInit = z.infer<typeof AIMessageInit>;

/** `retry` runs the last response again */
export const AIConversationAction = z.object({
	action: z.literal(['cancel', 'retry']),
});
export type AIConversationAction = z.infer<typeof AIConversationAction>;

const AIAPI = {
	'ai/models': {
		GET: AIModels,
	},
	'users/:id/ai/conversations': {
		GET: AIConversation.array(),
		PUT: [AIConversationInit, AIConversation],
	},
	'ai/conversations/:id': {
		GET: AIConversation.extend({ messages: AIMessage.array() }),
		PATCH: [AIConversationInit, AIConversation],
		/** Sends a message and starts the response; returns the user's message and the pending response */
		PUT: [AIMessageInit, AIMessage.array()],
		/** `message` is the response being retried */
		POST: [AIConversationAction, z.object({ message: AIMessage.optional() })],
		DELETE: AIConversation,
	},
} as const;

type AIAPI = typeof AIAPI;

declare module '@axium/core/api' {
	export interface $API extends AIAPI {}
}

Object.assign($API, AIAPI);

/** Text appended to a field of a pending message */
export const AIDelta = z.object({
	conversationId: z.uuid(),
	messageId: z.uuid(),
	field: z.literal(['content', 'reasoning']),
	text: z.string(),
	/** The length of the field before `text`, in UTF-16 code units */
	position: z.int().nonnegative(),
});
export interface AIDelta extends z.infer<typeof AIDelta> {}

export const AIModelCapabilities = AIModel.pick({ id: true, reasoningLevels: true, defaultReasoning: true });
export interface AIModelCapabilities extends z.infer<typeof AIModelCapabilities> {}

const AIServerToClient = {
	'ai.delta': [AIDelta],
	'ai.message': [AIMessage],
	'ai.model': [AIModelCapabilities],
} as const;

declare module '@axium/core/socket' {
	export interface ServerToClient extends ParseFunctions<typeof AIServerToClient> {}
}

addServerToClient(AIServerToClient);
