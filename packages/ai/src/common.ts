import { $API, serverConfigs } from '@axium/core';
import { appPreferences } from '@axium/core/apps';
import { addServerToClient, type ParseFunctions } from '@axium/core/socket';
import * as locales from '@james-pre/locales';
import * as z from 'zod';

export const ModelId = z
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
export const HubRepoId = z
	.string()
	.max(200)
	.regex(/^[\w.-]+\/[\w.-]+$/, 'Repositories have the form <owner>/<name>');

/** A quantization tag, as llama.cpp matches it against file names */
export const QuantTag = z
	.string()
	.max(32)
	.regex(/^[A-Z0-9_]+$/);

export const LlamaConfig = z.object({
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
export interface LlamaConfig extends z.infer<typeof LlamaConfig> {}

export const Config = z.object({
	/** Where downloaded models and llama-server's state are kept */
	data_dir: z.string().min(1),
	llama: LlamaConfig,
	/** Used for models without their own system prompt; the current date is appended */
	system_prompt: z.string(),
	/** Seconds a single response may take before it is stopped */
	timeout: z.number().positive(),
});
export interface Config extends z.infer<typeof Config> {}

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/ai': Config;
	}
}

serverConfigs.set('@axium/ai', Config);

/** `default` uses the model's default, `none` disables reasoning, anything else is a level */
export const Reasoning = z
	.string()
	.regex(/^[a-z]+$/)
	.max(16);

/** Reasoning levels with names, lowest to highest */
export const reasoningLevels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export const ModelStatus = z.literal(['unavailable', 'downloading', 'incomplete', 'unloaded', 'loading', 'loaded', 'sleeping']);
export type ModelStatus = z.infer<typeof ModelStatus>;

/** Sizes in bytes */
export const MemoryUse = z.object({
	device: z.number().nonnegative(),
	host: z.number().nonnegative(),
});
export interface MemoryUse extends z.infer<typeof MemoryUse> {}

export const ModelMemory = z.object({
	/** At the smallest context the model may be loaded with */
	minimum: MemoryUse.optional(),
	/** While loaded */
	current: MemoryUse.optional(),
	/** The context size while loaded, in tokens */
	context: z.int().optional(),
});
export interface ModelMemory extends z.infer<typeof ModelMemory> {}

/** How llama-server loads a model */
export const ModelOptions = z.object({
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
export interface ModelOptions extends z.infer<typeof ModelOptions> {}

export const DownloadProgress = z.object({
	/** Bytes */
	done: z.number().nonnegative(),
	/** Bytes */
	total: z.number().nonnegative(),
});
export interface DownloadProgress extends z.infer<typeof DownloadProgress> {}

export const Model = z.object({
	id: ModelId,
	name: z.string().min(1).max(100),
	/** `<repository>:<quantization>` */
	source: z.string(),
	/** Bytes on disk once downloaded */
	size: z.coerce.bigint().nonnegative(),
	created: z.coerce.date(),
	status: ModelStatus,
	/** The last attempt to load the model failed */
	failed: z.boolean().optional(),
	progress: DownloadProgress.optional(),
	/** The context size the model was trained with, in tokens */
	contextLength: z.int().optional(),
	/** Input modalities */
	inputs: z.string().array().optional(),
	memory: ModelMemory.optional(),
	/** Reasoning levels the model distinguishes, lowest to highest. Empty when it only has on and off; missing when not known yet. */
	reasoningLevels: Reasoning.array().optional(),
	/** What the chat template does without a reasoning level: `none` or one of the levels. Missing when not known. */
	templateReasoning: Reasoning.optional(),
	/** What `default` amounts to, set by an administrator */
	reasoning: Reasoning.nullable(),
	systemPrompt: z.string().max(20_000).nullable(),
	options: ModelOptions,
});
export interface Model extends z.infer<typeof Model> {}

/** Whether a model can be chatted with */
export function isUsable(model: Pick<Model, 'status'>): boolean {
	return model.status != 'unavailable' && model.status != 'downloading' && model.status != 'incomplete';
}

/** What `default` amounts to for a model, when known */
export function defaultReasoning(model: Pick<Model, 'reasoning' | 'templateReasoning'>): string | undefined {
	return model.reasoning ?? model.templateReasoning;
}

export const Device = z.object({
	name: z.string(),
	/** Bytes */
	total: z.number().nonnegative(),
	/** Bytes in use by anything, when known */
	used: z.number().nonnegative().optional(),
});
export interface Device extends z.infer<typeof Device> {}

export const Memory = z.object({
	devices: Device.array(),
	host: Device,
});
export interface Memory extends z.infer<typeof Memory> {}

export const Models = z.object({
	models: Model.array(),
	default: ModelId.optional(),
	memory: Memory,
	/** Whether llama-server is reachable */
	running: z.boolean(),
});
export interface Models extends z.infer<typeof Models> {}

export const ModelInit = z.object({
	id: ModelId,
	name: Model.shape.name,
	repo: HubRepoId,
	quant: QuantTag,
	options: ModelOptions.optional(),
});
export interface ModelInit extends z.infer<typeof ModelInit> {}

export const ModelUpdate = z.object({
	name: Model.shape.name.optional(),
	reasoning: Reasoning.nullable().optional(),
	systemPrompt: Model.shape.systemPrompt.optional(),
	options: ModelOptions.optional(),
	/** Makes this the default model for everyone */
	default: z.literal(true).optional(),
});
export interface ModelUpdate extends z.infer<typeof ModelUpdate> {}

/** `pause` and `resume` apply to downloads */
export const ModelAction = z.object({
	action: z.literal(['load', 'unload', 'pause', 'resume']),
});
export interface ModelAction extends z.infer<typeof ModelAction> {}

export const HubSearch = z.object({
	search: z.string().trim().min(1).max(200),
});

export const HubRepo = z.object({
	id: HubRepoId,
	downloads: z.int().nonnegative(),
	likes: z.int().nonnegative(),
	modified: z.coerce.date().optional(),
});
export interface HubRepo extends z.infer<typeof HubRepo> {}

/** Where a model's weights would go: all on a device, partly in host memory, or nowhere */
export const Fit = z.literal(['device', 'host', 'none']);
export type Fit = z.infer<typeof Fit>;

export const HubQuant = z.object({
	tag: QuantTag,
	files: z.string().array(),
	/** Bytes, including sidecar files */
	size: z.coerce.bigint().nonnegative(),
	fit: Fit,
});
export interface HubQuant extends z.infer<typeof HubQuant> {}

export const HubDetails = z.object({
	repo: HubRepoId,
	/** The repository the weights were converted from */
	base: HubRepoId.optional(),
	quants: HubQuant.array(),
});
export interface HubDetails extends z.infer<typeof HubDetails> {}

export const ConversationInit = z.object({
	title: z.string().max(200).optional(),
	/** `null` uses the default model */
	model: ModelId.nullish(),
	reasoning: Reasoning.optional(),
});
export type ConversationInit = z.infer<typeof ConversationInit>;

export const Conversation = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	title: z.string(),
	/** `null` when the model was removed or the default model is used */
	model: ModelId.nullable(),
	reasoning: Reasoning,
	created: z.coerce.date(),
	modified: z.coerce.date(),
});
export interface Conversation extends z.infer<typeof Conversation> {}

export const MessageRole = z.literal(['user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof MessageRole>;

export const MessageStatus = z.literal(['pending', 'done', 'error', 'cancelled']);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const ToolCall = z.object({
	id: z.string(),
	name: z.string(),
	/** JSON, as produced by the model */
	arguments: z.string(),
});
export interface ToolCall extends z.infer<typeof ToolCall> {}

export const Usage = z.object({
	promptTokens: z.int().nonnegative(),
	completionTokens: z.int().nonnegative(),
	/** Tokens per second */
	promptSpeed: z.number().optional(),
	/** Tokens per second */
	generationSpeed: z.number().optional(),
});
export interface Usage extends z.infer<typeof Usage> {}

export const Message = z.object({
	id: z.uuid(),
	conversationId: z.uuid(),
	created: z.coerce.date(),
	role: MessageRole,
	content: z.string(),
	reasoning: z.string().nullable(),
	toolCalls: ToolCall.array().nullable(),
	toolCallId: z.string().nullable(),
	status: MessageStatus,
	error: z.string().nullable(),
	usage: Usage.nullable(),
});
export interface Message extends z.infer<typeof Message> {}

export const MessageInit = z.object({
	content: z.string().trim().min(1).max(100_000),
});
export type MessageInit = z.infer<typeof MessageInit>;

export const ConversationAction = z.discriminatedUnion('action', [
	/** Cancel the current response */
	z.object({ action: z.literal('cancel') }),
	/** Retry the last response */
	z.object({ action: z.literal('retry') }),
	/** Replaces the content of one of the user's messages, removes the messages after it, and responds again. */
	MessageInit.extend({ action: z.literal('edit'), message: z.uuid() }),
]);
export type ConversationAction = z.infer<typeof ConversationAction>;

/** A message in a temporary conversation, which only the client keeps */
export const TemporaryMessage = z.object({
	role: z.literal(['user', 'assistant']),
	content: z.string().max(100_000),
});
export interface TemporaryMessage extends z.infer<typeof TemporaryMessage> {}

export const TemporaryInit = z.object({
	/** `null` uses the default model */
	model: ModelId.nullish(),
	reasoning: Reasoning,
	/** The conversation so far, ending with the message to respond to */
	messages: TemporaryMessage.array()
		.min(1)
		.max(1000)
		.refine(messages => messages.at(-1)?.role == 'user' && !!messages.at(-1)?.content.trim(), 'The last message must be from the user'),
});
export interface TemporaryInit extends z.infer<typeof TemporaryInit> {}

export const Preferences = z
	.object({
		/** Used for new conversations instead of the default model */
		model: ModelId.optional(),
		reasoning: z
			.literal(['default', 'none', 'low', 'medium', 'high', 'max'])
			.default('default')
			.register(locales.zod, { prefix: 'ai.reasoning_level' }),
		ctrl_enter: z.boolean().default(false),
		/** Added to the system prompt of every conversation */
		instructions: z.string().max(10_000).optional().register(locales.zod, { multiline: true }),
	})
	.register(locales.zod, { prefix: 'ai.preferences' });
export interface Preferences extends z.infer<typeof Preferences> {}

appPreferences.set('ai', Preferences);

import type {} from '@axium/core/apps';
declare module '@axium/core/apps' {
	interface $AppPreferences {
		ai: typeof Preferences;
	}
}

/** The closest reasoning setting a model supports to a general preference */
export function preferredReasoning(preference: string, model?: Pick<Model, 'reasoningLevels' | 'reasoning' | 'templateReasoning'>): string {
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
		GET: Models,
		/** Starts downloading a model */
		PUT: [ModelInit, Model],
	},
	'ai/models/:id': {
		GET: Model,
		PATCH: [ModelUpdate, Model],
		POST: [ModelAction, Model],
		DELETE: Model,
	},
	'ai/hub': {
		GET: [HubSearch, HubRepo.array()],
	},
	'ai/hub/details': {
		GET: [z.object({ repo: HubRepoId }), HubDetails],
	},
	'users/:id/ai/conversations': {
		GET: Conversation.array(),
		PUT: [ConversationInit, Conversation],
	},
	'ai/conversations/:id': {
		GET: Conversation.extend({ messages: Message.array() }),
		PATCH: [ConversationInit, Conversation],
		/** Sends a message and starts the response; returns the user's message and the pending response */
		PUT: [MessageInit, Message.array()],
		/** `message` is the new pending response, for `retry` and `edit` */
		POST: [ConversationAction, z.object({ message: Message.optional() })],
		DELETE: Conversation,
	},
	'ai/temporary/:id': {
		/** Starts a response without saving anything; returns the pending response */
		PUT: [TemporaryInit, Message],
		POST: [z.object({ action: z.literal('cancel') }), z.object({})],
	},
} as const;

type AIAPI = typeof AIAPI;

declare module '@axium/core/api' {
	export interface $API extends AIAPI {}
}

Object.assign($API, AIAPI);

export const MessagesRemoved = z.object({
	conversationId: z.uuid(),
	ids: z.uuid().array(),
});
export interface MessagesRemoved extends z.infer<typeof MessagesRemoved> {}

/** Text appended to a field of a pending message */
export const Delta = z.object({
	conversationId: z.uuid(),
	messageId: z.uuid(),
	field: z.literal(['content', 'reasoning']),
	text: z.string(),
	/** The length of the field before `text`, in UTF-16 code units */
	position: z.int().nonnegative(),
});
export interface Delta extends z.infer<typeof Delta> {}

const AIServerToClient = {
	'ai.delta': [Delta],
	'ai.message': [Message],
	'ai.model': [Model],
	'ai.message.remove': [MessagesRemoved],
	'ai.model.remove': [ModelId],
	'ai.conversation': [Conversation],
} as const;

declare module '@axium/core/socket' {
	export interface ServerToClient extends ParseFunctions<typeof AIServerToClient> {}
}

addServerToClient(AIServerToClient);
