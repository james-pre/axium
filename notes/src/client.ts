import type { Note } from './common.js';

export function parseNote<const T extends Note>(note: T): T {
	note.created = new Date(note.created);
	note.modified = new Date(note.modified);
	return note;
}
