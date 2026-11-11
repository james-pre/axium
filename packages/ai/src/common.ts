import { $API, serverConfigs } from '@axium/core';
import { appPreferences } from '@axium/core/apps';
import { addServerToClient, type ParseFunctions } from '@axium/core/socket';
import * as locales from '@james-pre/locales';
import * as z from 'zod';

export const AIModelId = z
	.string()
	.max(64)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Model IDs may only contain lowercase letters, numbers, and single dashes between them');

/** Turns a display name into a model ID */
export function modelIdFrom(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
		.replace(/-+$/, '');
}

/** A Hugging Face repository */
export const AIHubRepoId = z
	.string()
	.max(200)
	.regex(/^[\w.-]+\/[\w.-]+$/, 'Repositories have the form <owner>/<name>');

/** A quantization tag, as llama.cpp matches it against file names */
export const AIQuantTag = z
	.string()
	.max(32)
	.regex(/^[A-Z0-9_]+$/);

export const AILlamaConfig = z.object({
	/** The `llama-server` executable, either a path or a name looked up in `PATH` */
	command: z.string().min(1),
	host: z.string().min(1),
	port: z.int().min(1).max(65535),
	/** How many models may be loaded at once, 0 for no limit */
	models_max: z.int().nonnegative(),
	/** Device memory to keep free when loading models, in MiB */
	memory_margin: z.int().nonnegative(),
	/** Options applied to every model, using llama-server's argument names without dashes */
	defaults: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
	/** Used for Hugging Face downloads */
	hf_token: z.string().optional(),
});
export interface AILlamaConfig extends z.infer<typeof AILlamaConfig> {}

export const AIConfig = z.object({
	/** Where downloaded models and llama-server's state are kept */
	data_dir: z.string().min(1),
	llama: AILlamaConfig,
	/** Used for models without their own system prompt; the current date is appended */
	system_prompt: z.string(),
	/** Seconds a single response may take before it is stopped */
	timeout: z.number().positive(),
});
export interface AIConfig extends z.infer<typeof AIConfig> {}

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/ai': AIConfig;
	}
}

serverConfigs.set('@axium/ai', AIConfig);

/** `default` uses the model's default, `none` disables reasoning, anything else is a level */
export const AIReasoning = z
	.string()
	.regex(/^[a-z]+$/)
	.max(16);

/** Reasoning levels with names, lowest to highest */
export const reasoningLevels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export const AIModelStatus = z.literal(['unavailable', 'downloading', 'incomplete', 'unloaded', 'loading', 'loaded', 'sleeping']);
export type AIModelStatus = z.infer<typeof AIModelStatus>;

/** Sizes in bytes */
export const AIMemoryUse = z.object({
	device: z.number().nonnegative(),
	host: z.number().nonnegative(),
});
export interface AIMemoryUse extends z.infer<typeof AIMemoryUse> {}

export const AIModelMemory = z.object({
	/** At the smallest context the model may be loaded with */
	minimum: AIMemoryUse.optional(),
	/** While loaded */
	current: AIMemoryUse.optional(),
	/** The context size while loaded, in tokens */
	context: z.int().optional(),
});
export interface AIModelMemory extends z.infer<typeof AIModelMemory> {}

/** How llama-server loads a model */
export const AIModelOptions = z.object({
	/** Comma-separated llama.cpp device names */
	device: z
		.string()
		.max(64)
		.regex(/^[\w,]+$/)
		.optional(),
	/** Context size in tokens */
	context: z.int().positive().optional(),
	/** Device memory to leave free when fitting the model, in MiB */
	reserve: z.int().nonnegative().optional(),
	/** Number of requests the model serves at once */
	parallel: z.int().positive().max(64).optional(),
});
export interface AIModelOptions extends z.infer<typeof AIModelOptions> {}

export const AIDownloadProgress = z.object({
	/** Bytes */
	done: z.number().nonnegative(),
	/** Bytes */
	total: z.number().nonnegative(),
});
export interface AIDownloadProgress extends z.infer<typeof AIDownloadProgress> {}

export const AIModel = z.object({
	id: AIModelId,
	name: z.string().min(1).max(100),
	/** `<repository>:<quantization>` */
	source: z.string(),
	/** Bytes on disk once downloaded */
	size: z.coerce.bigint().nonnegative(),
	created: z.coerce.date(),
	status: AIModelStatus,
	/** The last attempt to load the model failed */
	failed: z.boolean().optional(),
	progress: AIDownloadProgress.optional(),
	/** The context size the model was trained with, in tokens */
	contextLength: z.int().optional(),
	/** Input modalities */
	inputs: z.string().array().optional(),
	memory: AIModelMemory.optional(),
	/** Reasoning levels the model distinguishes, lowest to highest. Empty when it only has on and off; missing when not known yet. */
	reasoningLevels: AIReasoning.array().optional(),
	/** What the chat template does without a reasoning level: `none` or one of the levels. Missing when not known. */
	templateReasoning: AIReasoning.optional(),
	/** What `default` amounts to, set by an administrator */
	reasoning: AIReasoning.nullable(),
	systemPrompt: z.string().max(20_000).nullable(),
	options: AIModelOptions,
});
export interface AIModel extends z.infer<typeof AIModel> {}

/** Whether a model can be chatted with */
export function isUsable(model: Pick<AIModel, 'status'>): boolean {
	return model.status != 'unavailable' && model.status != 'downloading' && model.status != 'incomplete';
}

/** What `default` amounts to for a model, when known */
export function defaultReasoning(model: Pick<AIModel, 'reasoning' | 'templateReasoning'>): string | undefined {
	return model.reasoning ?? model.templateReasoning;
}

export const AIDevice = z.object({
	name: z.string(),
	/** Bytes */
	total: z.number().nonnegative(),
	/** Bytes in use by anything, when known */
	used: z.number().nonnegative().optional(),
});
export interface AIDevice extends z.infer<typeof AIDevice> {}

export const AIMemory = z.object({
	devices: AIDevice.array(),
	host: AIDevice,
});
export interface AIMemory extends z.infer<typeof AIMemory> {}

export const AIModels = z.object({
	models: AIModel.array(),
	default: AIModelId.optional(),
	memory: AIMemory,
	/** Whether llama-server is reachable */
	running: z.boolean(),
});
export interface AIModels extends z.infer<typeof AIModels> {}

export const AIModelInit = z.object({
	id: AIModelId,
	name: AIModel.shape.name,
	repo: AIHubRepoId,
	quant: AIQuantTag,
	options: AIModelOptions.optional(),
});
export interface AIModelInit extends z.infer<typeof AIModelInit> {}

export const AIModelUpdate = z.object({
	name: AIModel.shape.name.optional(),
	reasoning: AIReasoning.nullable().optional(),
	systemPrompt: AIModel.shape.systemPrompt.optional(),
	options: AIModelOptions.optional(),
	/** Makes this the default model for everyone */
	default: z.literal(true).optional(),
});
export interface AIModelUpdate extends z.infer<typeof AIModelUpdate> {}

/** `pause` and `resume` apply to downloads */
export const AIModelAction = z.object({
	action: z.literal(['load', 'unload', 'pause', 'resume']),
});
export interface AIModelAction extends z.infer<typeof AIModelAction> {}

export const AIHubSearch = z.object({
	search: z.string().trim().min(1).max(200),
});

export const AIHubRepo = z.object({
	id: AIHubRepoId,
	downloads: z.int().nonnegative(),
	likes: z.int().nonnegative(),
	modified: z.coerce.date().optional(),
});
export interface AIHubRepo extends z.infer<typeof AIHubRepo> {}

/** Where a model's weights would go: all on a device, partly in host memory, or nowhere */
export const AIFit = z.literal(['device', 'host', 'none']);
export type AIFit = z.infer<typeof AIFit>;

export const AIHubQuant = z.object({
	tag: AIQuantTag,
	files: z.string().array(),
	/** Bytes, including sidecar files */
	size: z.coerce.bigint().nonnegative(),
	fit: AIFit,
});
export interface AIHubQuant extends z.infer<typeof AIHubQuant> {}

export const AIHubDetails = z.object({
	repo: AIHubRepoId,
	/** The repository the weights were converted from */
	base: AIHubRepoId.optional(),
	quants: AIHubQuant.array(),
});
export interface AIHubDetails extends z.infer<typeof AIHubDetails> {}

export const AIConversationInit = z.object({
	title: z.string().max(200).optional(),
	/** `null` uses the default model */
	model: AIModelId.nullish(),
	reasoning: AIReasoning.optional(),
});
export type AIConversationInit = z.infer<typeof AIConversationInit>;

export const AIConversation = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	title: z.string(),
	/** `null` when the model was removed or the default model is used */
	model: AIModelId.nullable(),
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

export const AIPreferences = z
	.object({
		/** Used for new conversations instead of the default model */
		model: AIModelId.optional(),
		reasoning: z
			.literal(['default', 'none', 'low', 'medium', 'high', 'max'])
			.default('default')
			.register(locales.zod, { prefix: 'ai.reasoning_level' }),
		ctrl_enter: z.boolean().default(false),
		/** Added to the system prompt of every conversation */
		instructions: z.string().max(10_000).optional().register(locales.zod, { multiline: true }),
	})
	.register(locales.zod, { prefix: 'ai.preferences' });
export interface AIPreferences extends z.infer<typeof AIPreferences> {}

appPreferences.set('ai', AIPreferences);

import type {} from '@axium/core/apps';
declare module '@axium/core/apps' {
	interface $AppPreferences {
		ai: typeof AIPreferences;
	}
}

/** The closest reasoning setting a model supports to a general preference */
export function preferredReasoning(
	preference: string,
	model?: Pick<AIModel, 'reasoningLevels' | 'reasoning' | 'templateReasoning'>
): string {
	if (preference == 'default' || preference == 'none' || !model?.reasoningLevels) return preference;

	const levels = model.reasoningLevels;
	if (!levels.length) return defaultReasoning(model) == 'none' ? 'high' : 'default';
	if (levels.includes(preference)) return preference;

	const ranks = reasoningLevels as readonly string[];
	const target = ranks.indexOf(preference);
	const known = levels.filter(level => ranks.includes(level));
	if (target == -1 || !known.length) return 'default';

	return known.reduce((best, level) => (Math.abs(ranks.indexOf(level) - target) < Math.abs(ranks.indexOf(best) - target) ? level : best));
}

const AIAPI = {
	'ai/models': {
		GET: AIModels,
		/** Starts downloading a model */
		PUT: [AIModelInit, AIModel],
	},
	'ai/models/:id': {
		GET: AIModel,
		PATCH: [AIModelUpdate, AIModel],
		POST: [AIModelAction, AIModel],
		DELETE: AIModel,
	},
	'ai/hub': {
		GET: [AIHubSearch, AIHubRepo.array()],
	},
	'ai/hub/details': {
		GET: [z.object({ repo: AIHubRepoId }), AIHubDetails],
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

const AIServerToClient = {
	'ai.delta': [AIDelta],
	'ai.message': [AIMessage],
	'ai.model': [AIModel],
	'ai.model.remove': [AIModelId],
	'ai.conversation': [AIConversation],
} as const;

declare module '@axium/core/socket' {
	export interface ServerToClient extends ParseFunctions<typeof AIServerToClient> {}
}

addServerToClient(AIServerToClient);
