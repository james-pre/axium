import type { Note } from '@axium/notes/common';
import * as z from 'zod';
import * as tools from '../tools.js';

/** Characters of a note's content shown when listing */
const previewLength = 200;

function summary(note: Note, userId: string) {
	const content = note.content ?? '';
	return {
		id: note.id,
		title: note.title,
		labels: note.labels,
		pinned: note.pinned,
		shared: note.userId != userId,
		modified: note.modified,
		preview: content.length > previewLength ? content.slice(0, previewLength) + '…' : content,
	};
}

function details(note: Note, userId: string) {
	return {
		id: note.id,
		title: note.title,
		content: note.content ?? '',
		labels: note.labels,
		pinned: note.pinned,
		shared: note.userId != userId,
		created: note.created,
		modified: note.modified,
	};
}

const Id = z.uuid().describe("The note's ID, from list_notes");
const Labels = z.string().max(30).array().max(20).describe('Short labels for grouping notes');

tools.add({
	name: 'list_notes',
	description:
		"Lists the user's notes, including ones shared with them, pinned first then most recently changed. " +
		'Contents are previews; use read_note for the whole note.',
	environment: 'account',
	access: 'read',
	input: z.object({
		query: z.string().max(200).optional().describe('Only notes whose title or content contains this, ignoring case'),
		label: z.string().max(30).optional().describe('Only notes with this label'),
	}),
	async run({ query, label }, { api, userId }) {
		const search = query?.toLowerCase();

		return (await api('GET', 'users/:id/notes', {}, userId))
			.filter(note => !label || note.labels.includes(label))
			.filter(note => !search || note.title.toLowerCase().includes(search) || note.content?.toLowerCase().includes(search))
			.slice(0, 50)
			.map(note => summary(note, userId));
	},
});

tools.add({
	name: 'read_note',
	description: 'Reads a whole note.',
	environment: 'account',
	access: 'read',
	input: z.object({ id: Id }),
	async run({ id }, { api, userId }) {
		return details(await api('GET', 'notes/:id', {}, id), userId);
	},
});

tools.add({
	name: 'create_note',
	description: 'Creates a note.',
	environment: 'account',
	access: 'write',
	approval: 'allow',
	input: z.object({
		title: z.string().max(100),
		content: z.string().max(10_000).optional().describe('Plain text or Markdown'),
		labels: Labels.optional(),
		pinned: z.boolean().optional(),
	}),
	async run(init, { api, userId }) {
		return details(await api('PUT', 'users/:id/notes', { labels: [], pinned: false, ...init }, userId), userId);
	},
});

tools.add({
	name: 'update_note',
	description:
		'Changes a note. Only the given fields change; `content` replaces the whole content, so read the note first to edit part of it.',
	environment: 'account',
	access: 'write',
	input: z.object({
		id: Id,
		title: z.string().max(100).optional(),
		content: z.string().max(10_000).optional().describe('The new content, replacing the old'),
		labels: Labels.optional().describe('The new labels, replacing the old'),
		pinned: z.boolean().optional(),
	}),
	async run({ id, ...changes }, { api, userId }) {
		const note = await api('GET', 'notes/:id', {}, id);
		const { title, content, labels, pinned } = { ...note, ...changes };
		return details(await api('PATCH', 'notes/:id', { title, content, labels, pinned }, id), userId);
	},
});

tools.add({
	name: 'delete_note',
	description: 'Deletes a note permanently.',
	environment: 'account',
	access: 'write',
	input: z.object({ id: Id }),
	async run({ id }, { api }) {
		const note = await api('DELETE', 'notes/:id', {}, id);
		return { deleted: { id: note.id, title: note.title } };
	},
});
