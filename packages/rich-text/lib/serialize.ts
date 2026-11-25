import { toPlainText, type RichTextDocument } from '@axium/rich-text';
import { getHTMLFromFragment, getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { createExtensions, type RichTextPreset } from './extensions.js';
import type { CustomNode } from './nodes.svelte.js';

export interface SerializeOptions {
	preset?: RichTextPreset;
	nodes?: CustomNode<any>[];
}

/** Custom nodes are written as the element from their `html` option. */
export function toHTML(content: RichTextDocument, options: SerializeOptions = {}): string {
	const schema = getSchema(createExtensions(options.preset ?? 'document', options.nodes));
	return getHTMLFromFragment(Node.fromJSON(schema, content).content, schema);
}

export function toText(content: RichTextDocument, nodes: CustomNode<any>[] = []): string {
	return toPlainText(content, {
		nodes: Object.fromEntries(nodes.map(node => [node.name, child => node.text(child.attrs?.data)])),
	});
}
