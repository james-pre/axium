import type { Extensions } from '@tiptap/core';
import { TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';
import type { CustomNode } from './nodes.svelte.js';
import { TaskItem } from './task-item.js';

/**
 * Which formatting a document supports.
 * `email` leaves out task lists, which mail clients can't show.
 */
export type RichTextPreset = 'document' | 'email';

export function createExtensions(preset: RichTextPreset, nodes: CustomNode<any>[] = []): Extensions {
	const extensions: Extensions = [
		StarterKit.configure({
			link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
		}),
		TableKit.configure({ table: { resizable: false } }),
		...nodes.map(node => node.extension),
	];

	if (preset == 'document') extensions.push(TaskList, TaskItem.configure({ nested: true }));

	return extensions;
}
