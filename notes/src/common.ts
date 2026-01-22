import { $API } from '@axium/core/api';
import * as z from 'zod';

export const NoteInit = z.object({
	title: z.string().max(100),
	content: z.string().max(10_000).nullish(),
	labels: z.array(z.string().max(30)).default([]),
});

export interface NoteInit extends z.infer<typeof NoteInit> {}

export const Note = NoteInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	created: z.coerce.date(),
	modified: z.coerce.date(),
});

export interface Note extends z.infer<typeof Note> {}

const NotesAPI = {
	'users/:id/notes': {
		GET: Note.array(),
		PUT: [NoteInit, Note],
	},
	'notes/:id': {
		GET: Note,
		PATCH: [NoteInit, Note],
		DELETE: Note,
	},
} as const;

type NotesAPI = typeof NotesAPI;

declare module '@axium/core/api' {
	export interface $API extends NotesAPI {}
}

Object.assign($API, NotesAPI);
