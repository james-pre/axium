import { pick } from 'utilium';
import * as z from 'zod';
import * as tools from './tools.js';

/**
 * Where a memory came from: added by the user on the memory page (`user`), saved when the user asked (`explicit`),
 * saved because the model judged it worth keeping (`inferred`), or found by reviewing conversations (`periodic`)
 */
export const Source = z.literal(['user', 'explicit', 'inferred', 'periodic']);
export type Source = z.infer<typeof Source>;

/** Unique for each user, in `kebab-case` */
export const Id = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens, e.g. "coffee-preferences"');

/** One line saying what a memory is about, shown to the model in every conversation */
export const Description = z.string().trim().min(1).max(200);

/** Details the model reads only when relevant; limited further by the `max_memory_length` config */
export const Content = z.string().trim().max(10_000);

/** A memory */
export const Node = z.object({
	id: Id,
	userId: z.uuid(),
	description: z.string(),
	content: z.string(),
	source: Source,
	/** The conversation the memory was saved in, while it exists */
	conversationId: z.uuid().nullable(),
	created: z.coerce.date(),
	modified: z.coerce.date(),
});
export interface Node extends z.infer<typeof Node> {}

export const Init = z.object({
	id: Id,
	description: Description,
	content: Content.default(''),
	source: Source.default('user'),
	conversationId: z.uuid().nullish(),
});
export interface Init extends z.infer<typeof Init> {}

export const Update = z.object({
	id: Id.optional(),
	description: Description.optional(),
	content: Content.optional(),
});
export interface Update extends z.infer<typeof Update> {}

/** A user's memories with the limits on them */
export const List = z.object({
	memories: Node.array(),
	/** The most memories a user may have */
	limit: z.int().positive(),
	/** The most characters in a memory's content */
	maxLength: z.int().positive(),
});
export interface List extends z.infer<typeof List> {}

export const UpdateFrequency = z.literal(['off', 'daily', 'weekly']);
export type UpdateFrequency = z.infer<typeof UpdateFrequency>;

/** IDs of the memories an update changed */
export const ChangeIds = z.object({
	added: Id.array().default([]),
	updated: Id.array().default([]),
	deleted: Id.array().default([]),
});
export interface ChangeIds extends z.infer<typeof ChangeIds> {}

/** The state of a user's periodic memory updates */
export const Updates = z.object({
	/** Whether the server allows them */
	enabled: z.boolean(),
	frequency: UpdateFrequency,
	/** When the last update finished */
	ran: z.coerce.date().nullable(),
	/** What the last update changed, as the model described it */
	summary: z.string().nullable(),
	changes: ChangeIds.nullable(),
	/** When the next update starts */
	next: z.coerce.date().nullable(),
	running: z.boolean(),
});
export interface Updates extends z.infer<typeof Updates> {}

/** The changes a model proposes when updating memories, as structured output */
export const Changes = z.object({
	add: z.object({ id: Id, description: Description, content: Content }).array().max(20).describe('New memories'),
	update: z
		.object({ id: Id, description: Description.optional(), content: Content.optional() })
		.array()
		.max(20)
		.describe('Changes to existing memories; only the fields that change'),
	delete: Id.array().max(20).describe('IDs of memories to delete'),
	summary: z.string().max(300).describe('One sentence for the user saying what changed, or that nothing did'),
});
export interface Changes extends z.infer<typeof Changes> {}

const writeGuidance =
	'You have a long-term memory of the user. When they share something lasting about themselves that would help in future conversations, ' +
	"such as preferences, facts about their life or ongoing projects, save it with add_memory, even if they didn't ask. " +
	"Don't save trivia, one-off requests or things that only matter in this conversation. " +
	'Each memory has a kebab-case ID, a one-line description that you see in every conversation, and optional content with details, ' +
	'e.g. ID "coffee", description "How the user takes their coffee", content "- Oat milk, no sugar". ' +
	'Prefer adding to a related memory with update_memory over creating a new one, and update or delete memories that are wrong or outdated.';

/**
 * The system prompt section about memory. Only descriptions are included; the model reads a memory's content with `read_memory`.
 * @param writable Whether the tools that change memories are offered
 */
export function prompt(memories: Node[], writable: boolean): string | undefined {
	if (!memories.length && !writable) return;

	const sections: string[] = [];
	if (writable) sections.push(writeGuidance);

	if (!memories.length) sections.push("You don't remember anything about the user yet.");
	else {
		sections.push(
			'Your memories of the user from earlier conversations, by ID with a description. ' +
				'Read one with read_memory when its details would help. Use what you remember without mentioning it unless asked:\n' +
				memories.map(memory => `- ${memory.id}: ${memory.description.replace(/\s+/g, ' ')}`).join('\n')
		);
	}

	return sections.join('\n\n');
}

function full(memory: Node) {
	return pick(memory, 'id', 'description', 'content', 'modified');
}

const IdInput = Id.describe('The memory\'s ID, in kebab-case, e.g. "coffee-preferences"');
const DescriptionInput = Description.describe('One line saying what the memory is about');
const ContentInput = Content.describe('Details, as Markdown, usually a short list of facts about the user written in the third person');

tools.add({
	name: 'read_memory',
	description: "Reads a memory's content.",
	environment: 'memory',
	access: 'read',
	input: z.object({ id: IdInput }),
	async run({ id }, { api, userId }) {
		return full(await api('GET', 'users/:id/ai/memories/:memory', {}, userId, id));
	},
});

/** The first line of `content` without list markers, for memories saved without a description */
function firstLine(content: string): string {
	const line = content.split('\n').find(line => line.trim()) ?? '';
	return line
		.replace(/^\s*(?:[-*+]|\d+[.)]|#+)\s*/, '')
		.trim()
		.slice(0, 200);
}

tools.add({
	name: 'add_memory',
	description:
		'Saves something about the user to remember in future conversations. ' +
		'Give an ID and a one-line description; put details in content.',
	environment: 'memory',
	access: 'write',
	approval: 'allow',
	input: z.object({
		id: IdInput.describe('A new kebab-case ID naming what the memory is about, e.g. "coffee-preferences"'),
		description: DescriptionInput.optional().describe(
			'One line saying what the memory is about. Defaults to the first line of content.'
		),
		content: ContentInput.optional(),
		requested: z.boolean().optional().describe('Whether the user asked you to remember this'),
	}),
	async run({ requested, description, ...init }, { api, userId, conversationId }) {
		description ||= init.content && firstLine(init.content);
		if (!description) throw new Error('Give a description, or content to take it from');

		const source = requested ? 'explicit' : 'inferred';
		return full(await api('PUT', 'users/:id/ai/memories', { ...init, description, source, conversationId }, userId));
	},
});

tools.add({
	name: 'update_memory',
	description: 'Changes a memory. Use `append` to add to its content, or `content` to replace it; only the given fields change.',
	environment: 'memory',
	access: 'write',
	approval: 'allow',
	input: z.object({
		id: IdInput,
		description: DescriptionInput.optional(),
		content: ContentInput.optional().describe('New content, replacing the old'),
		append: z
			.string()
			.trim()
			.min(1)
			.max(2000)
			.optional()
			.describe('A line to add to the end of the content, e.g. "- Prefers oat milk"'),
		rename: IdInput.optional().describe('A new ID for the memory'),
	}),
	async run({ id, description, content, append, rename }, { api, userId }) {
		if (content !== undefined && append) throw new Error('Give either content or append, not both');

		if (append) {
			const existing = await api('GET', 'users/:id/ai/memories/:memory', {}, userId, id);
			content = existing.content ? existing.content + '\n' + append : append;
		}

		return full(await api('PATCH', 'users/:id/ai/memories/:memory', { id: rename, description, content }, userId, id));
	},
});

tools.add({
	name: 'delete_memory',
	description: 'Deletes a memory, e.g. when the user asks you to forget something.',
	environment: 'memory',
	access: 'write',
	approval: 'allow',
	input: z.object({ id: IdInput }),
	async run({ id }, { api, userId }) {
		const memory = await api('DELETE', 'users/:id/ai/memories/:memory', {}, userId, id);
		return { deleted: { id: memory.id, description: memory.description } };
	},
});
