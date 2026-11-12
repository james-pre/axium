import { pick } from 'utilium';
import * as z from 'zod';
import * as ai from './common.js';
import * as tools from './tools.js';

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
export function memoryPrompt(memories: ai.Memory[], writable: boolean): string | undefined {
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

function full(memory: ai.Memory) {
	return pick(memory, 'id', 'description', 'content', 'modified');
}

const Id = ai.MemoryId.describe('The memory\'s ID, in kebab-case, e.g. "coffee-preferences"');
const Description = ai.MemoryDescription.describe('One line saying what the memory is about');
const Content = ai.MemoryContent.describe('Details, as Markdown, usually a short list of facts about the user written in the third person');

tools.add({
	name: 'read_memory',
	description: "Reads a memory's content.",
	environment: 'memory',
	access: 'read',
	input: z.object({ id: Id }),
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
		id: Id.describe('A new kebab-case ID naming what the memory is about, e.g. "coffee-preferences"'),
		description: Description.optional().describe('One line saying what the memory is about. Defaults to the first line of content.'),
		content: Content.optional(),
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
		id: Id,
		description: Description.optional(),
		content: Content.optional().describe('New content, replacing the old'),
		append: z
			.string()
			.trim()
			.min(1)
			.max(2000)
			.optional()
			.describe('A line to add to the end of the content, e.g. "- Prefers oat milk"'),
		rename: Id.optional().describe('A new ID for the memory'),
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
	input: z.object({ id: Id }),
	async run({ id }, { api, userId }) {
		const memory = await api('DELETE', 'users/:id/ai/memories/:memory', {}, userId, id);
		return { deleted: { id: memory.id, description: memory.description } };
	},
});
