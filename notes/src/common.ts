import type { Permission } from '@axium/core';
import * as z from 'zod';

export const NoteInit = z.object({
	title: z.string().max(100),
	content: z.string().max(1000),
	labels: z.array(z.string().max(50)),
	publicPermission: z.int().min(0).max(5),
});

export interface NoteInit extends z.infer<typeof NoteInit> {
	publicPermission: Permission;
}

export interface Note extends z.infer<typeof NoteInit> {
	id: string;
	userId: string;
	created: Date;
	modified: Date;
}

declare module '@axium/core/api' {
	export interface $API {
		'users/:id/notes': {
			GET: Note[];
			PUT: [z.input<typeof NoteInit>, Note];
		};
		'notes/:id': {
			GET: Note;
			PATCH: [z.input<typeof NoteInit>, Note];
			DELETE: Note;
		};
	}
}
