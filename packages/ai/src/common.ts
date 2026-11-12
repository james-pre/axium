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

/** A display name for a model from its repository, e.g. "Gemma 4 E4B" from "org/Gemma-4-E4B-GGUF" */
export function nameFromRepo(repo: string): string {
	return repo
		.split('/')
		.at(-1)!
		.replace(/([-_.](i1|imatrix|gguf))+$/gi, '')
		.replace(/[-_]+/g, ' ');
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
	/** The most responses the model may give in one turn while using tools */
	max_steps: z.int().positive(),
	/** A SearXNG instance used by the web search tool, which is hidden while this is unset */
	search_url: z.url().nullish(),
	/** The most memories each user may have */
	max_memories: z.int().positive(),
	/** The most characters in a memory's content */
	max_memory_length: z.int().positive().max(10_000),
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

export const Modality = z.literal(['text', 'image', 'audio', 'video']);
export type Modality = z.infer<typeof Modality>;

export const ModelInfo = z.object({
	id: ModelId,
	name: z.string().min(1).max(100),
	/** `<repository>:<quantization>` */
	source: z.string(),
	/** Bytes on disk once downloaded */
	size: z.coerce.bigint().nonnegative(),
	created: z.coerce.date(),
	/** Reasoning levels the model distinguishes, lowest to highest. Empty when it only has on and off; missing when not known yet. */
	reasoningLevels: Reasoning.array().nullish(),
	/** What the chat template does without a reasoning level: `none` or one of the levels. Missing when not known. */
	templateReasoning: Reasoning.nullish(),
	/** Whether the chat template supports tool calls. Missing when not known. */
	tools: z.boolean().nullish(),
	/** What `default` amounts to, set by an administrator */
	reasoning: Reasoning.nullable(),
	systemPrompt: z.string().max(20_000).nullable(),
	options: ModelOptions,
});
export interface ModelInfo extends z.infer<typeof ModelInfo> {}

export const Model = z.object({
	...ModelInfo.shape,
	status: ModelStatus,
	/** The last attempt to load the model failed */
	failed: z.boolean().optional(),
	progress: DownloadProgress.optional(),
	/** The context size the model was trained with, in tokens */
	contextLength: z.int().optional(),
	inputs: Modality.array().optional(),
	outputs: Modality.array().optional(),
	memory: ModelMemory.optional(),
});
export interface Model extends z.infer<typeof Model> {}

/** Whether a model can be chatted with */
export function isUsable(model: Pick<Model, 'status'>): boolean {
	return model.status != 'unavailable' && model.status != 'downloading' && model.status != 'incomplete';
}

/** What `default` amounts to for a model, when known */
export function defaultReasoning(model: Pick<Model, 'reasoning' | 'templateReasoning'>): string | null | undefined {
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

/** RAM and VRAM */
export const DRAM = z.object({
	devices: Device.array(),
	host: Device,
});
export interface DRAM extends z.infer<typeof DRAM> {}

/** What a model is used for */
export const roles = ['chat', 'assistant', 'coding', 'stt', 'tts'] as const;

export const Role = z.literal(roles);
export type Role = z.infer<typeof Role>;

/** Models for each role, most preferred first */
export const Roles = z.record(Role, ModelId.array().max(50));
export interface Roles extends z.infer<typeof Roles> {}

export const RolesUpdate = z.partialRecord(Role, ModelId.array().max(50));
export interface RolesUpdate extends z.infer<typeof RolesUpdate> {}

/** Roles that use another role's models when none of their own are usable */
const roleFallbacks: Partial<Record<Role, Role>> = { assistant: 'chat', coding: 'chat' };

/** Whether a model has the modalities a role needs */
export function canServe(model: Pick<Model, 'inputs' | 'outputs'>, role: Role): boolean {
	switch (role) {
		case 'stt':
			return !!model.inputs?.includes('audio');
		case 'tts':
			return !!model.outputs?.includes('audio');
		default:
			return !model.outputs || model.outputs.includes('text');
	}
}

function servable(model: Model | undefined, role: Role): model is Model {
	return !!model && isUsable(model) && canServe(model, role);
}

/** The first model of `ids` that is usable, can serve the role and didn't fail to load */
export function firstServable(models: Model[], ids: string[], role: Role): Model | undefined {
	for (const id of ids) {
		const model = models.find(model => model.id == id);
		if (servable(model, role) && !model.failed) return model;
	}
}

/**
 * The model that serves a role: the first usable one in its list that didn't fail to load,
 * then the fallback role's, then any model that can serve it.
 */
export function resolveRole(models: Model[], roleModels: Roles, role: Role): Model | undefined {
	const listed = firstServable(models, roleModels[role], role);
	if (listed) return listed;

	const fallback = roleFallbacks[role];
	if (fallback) return resolveRole(models, roleModels, fallback);
	return models.find(model => servable(model, role) && !model.failed) ?? models.find(model => servable(model, role));
}

export const Models = z.object({
	models: Model.array(),
	roles: Roles,
	memory: DRAM,
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
	/** Names of tools the user allowed for the rest of the conversation */
	allowedTools: z.string().array(),
});
export interface Conversation extends z.infer<typeof Conversation> {}

export const MessageRole = z.literal(['user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof MessageRole>;

/** `awaiting` is a tool call waiting for the user to approve it */
export const MessageStatus = z.literal(['pending', 'done', 'error', 'cancelled', 'awaiting']);
export type MessageStatus = z.infer<typeof MessageStatus>;

/** Where a tool acts  */
export const Environment = z.literal(['account', 'web', 'memory']);
export type Environment = z.infer<typeof Environment>;

/** `write` tools change data, so they may need the user's approval */
export const ToolAccess = z.literal(['read', 'write']);
export type ToolAccess = z.infer<typeof ToolAccess>;

/** Whether a tool runs without asking */
export const Approval = z.literal(['ask', 'allow']);
export type Approval = z.infer<typeof Approval>;

/** `chat` allows the tool for the rest of the conversation, `always` for every conversation */
export const Decision = z.literal(['deny', 'once', 'chat', 'always']);
export type Decision = z.infer<typeof Decision>;

/** Tool call IDs mapped to the user's choice */
export const Decisions = z.record(z.string(), Decision);
export type Decisions = z.infer<typeof Decisions>;

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
	/** Approves or denies every tool call awaiting the user, then continues the response */
	z.object({ action: z.literal('decide'), decisions: Decisions }),
]);
export type ConversationAction = z.infer<typeof ConversationAction>;

/** A message in a temporary conversation, which only the client keeps */
export const TemporaryMessage = Message.pick({ id: true, role: true, toolCalls: true, toolCallId: true, status: true }).extend({
	content: z.string().max(100_000),
});
export interface TemporaryMessage extends z.infer<typeof TemporaryMessage> {}

export const TemporaryInit = z.object({
	/** `null` uses the default model */
	model: ModelId.nullish(),
	reasoning: Reasoning,
	/** Leaves out the user's memories and tools that use their data */
	anonymous: z.boolean().default(false),
	/** The conversation so far, ending with the message to respond to or the tool calls being decided */
	messages: TemporaryMessage.array().min(1).max(1000),
	/** For the tool calls at the end of `messages` that await the user */
	decisions: Decisions.optional(),
	/** Names of tools the user allowed for the rest of the conversation */
	allowedTools: z.string().array().max(100).default([]),
});
export interface TemporaryInit extends z.infer<typeof TemporaryInit> {}

/**
 * Where a memory came from: added by the user on the memory page (`user`), saved when the user asked (`explicit`),
 * saved because the model judged it worth keeping (`inferred`), or found by reviewing conversations (`periodic`)
 */
export const MemorySource = z.literal(['user', 'explicit', 'inferred', 'periodic']);
export type MemorySource = z.infer<typeof MemorySource>;

/** Unique for each user, in `kebab-case` */
export const MemoryId = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens, e.g. "coffee-preferences"');

/** One line saying what a memory is about, shown to the model in every conversation */
export const MemoryDescription = z.string().trim().min(1).max(200);

/** Details the model reads only when relevant; limited further by the `max_memory_length` config */
export const MemoryContent = z.string().trim().max(10_000);

export const Memory = z.object({
	id: MemoryId,
	userId: z.uuid(),
	description: z.string(),
	content: z.string(),
	source: MemorySource,
	/** The conversation the memory was saved in, while it exists */
	conversationId: z.uuid().nullable(),
	created: z.coerce.date(),
	modified: z.coerce.date(),
});
export interface Memory extends z.infer<typeof Memory> {}

export const MemoryInit = z.object({
	id: MemoryId,
	description: MemoryDescription,
	content: MemoryContent.default(''),
	source: MemorySource.default('user'),
	conversationId: z.uuid().nullish(),
});
export interface MemoryInit extends z.infer<typeof MemoryInit> {}

export const MemoryUpdate = z.object({
	id: MemoryId.optional(),
	description: MemoryDescription.optional(),
	content: MemoryContent.optional(),
});
export interface MemoryUpdate extends z.infer<typeof MemoryUpdate> {}

export const Memories = z.object({
	memories: Memory.array(),
	/** The most memories a user may have */
	limit: z.int().positive(),
	/** The most characters in a memory's content */
	maxLength: z.int().positive(),
});
export interface Memories extends z.infer<typeof Memories> {}

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
		tools: z
			.object({
				/** What tools may do with the user's Axium data */
				account_access: z
					.literal(['none', 'read', 'write'])
					.default('none')
					.register(locales.zod, { prefix: 'ai.data_access', feature: 'ai-account-access' }),
				/** Whether tools that change the user's data wait for approval */
				confirm_writes: z.boolean().default(true).register(locales.zod, { feature: 'ai-account-access' }),
				/** Whether tools may search and read the web */
				web: z.boolean().default(false).register(locales.zod, { feature: 'ai-web-tools' }),
				/** Per-tool overrides of whether write calls ask first, by tool name */
				approvals: z.record(z.string(), Approval).default({}).register(locales.zod, { feature: 'ai-account-access' }),
				/** Whether the assistant uses and saves memories */
				memory: z.boolean().default(true).register(locales.zod, { feature: 'ai-memory' }),
			})
			.default({ account_access: 'none', confirm_writes: true, web: false, approvals: {}, memory: true })
			.register(locales.zod, { prefix: 'ai.preferences.tools' }),
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
	'ai/roles': {
		GET: Roles,
		PATCH: [RolesUpdate, Roles],
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
	'users/:id/ai/memories': {
		GET: Memories,
		PUT: [MemoryInit, Memory],
	},
	'users/:id/ai/memories/:memory': {
		GET: Memory,
		PATCH: [MemoryUpdate, Memory],
		DELETE: Memory,
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
