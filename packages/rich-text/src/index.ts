import * as z from 'zod';

export const RichTextMark = z.object({
	type: z.string(),
	attrs: z.record(z.string(), z.unknown()).optional(),
});
export interface RichTextMark extends z.infer<typeof RichTextMark> {}

export interface RichTextNode {
	type: string;
	attrs?: Record<string, unknown>;
	content?: RichTextNode[];
	marks?: RichTextMark[];
	text?: string;
}

export const RichTextNode: z.ZodType<RichTextNode> = z.object({
	type: z.string(),
	attrs: z.record(z.string(), z.unknown()).optional(),
	get content() {
		return z.array(RichTextNode).optional();
	},
	marks: z.array(RichTextMark).optional(),
	text: z.string().optional(),
});

export interface RichTextDocument extends RichTextNode {
	type: 'doc';
	content: RichTextNode[];
}

export const RichTextDocument: z.ZodType<RichTextDocument> = z.object({
	type: z.literal('doc'),
	content: z.array(RichTextNode),
});

export function emptyDocument(): RichTextDocument {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Visit every node depth-first, parents before children.
 * Returning `false` from `visit` skips that node's children.
 */
export function walk(node: RichTextNode, visit: (node: RichTextNode, parent: RichTextNode | null) => void | false): void {
	function visitNode(current: RichTextNode, parent: RichTextNode | null): void {
		if (visit(current, parent) === false) return;
		for (const child of current.content ?? []) visitNode(child, current);
	}
	visitNode(node, null);
}

/** Every node of the given type, depth-first. */
export function* findNodes(node: RichTextNode, type: string): Generator<RichTextNode> {
	if (node.type == type) yield node;
	for (const child of node.content ?? []) yield* findNodes(child, type);
}

/**
 * Transform every descendant of `root` bottom-up, returning a new tree.
 * `transform` receives each node with its children already transformed.
 * It can return a replacement node, several nodes to splice in, or `null` to remove the node.
 */
export function mapNodes<T extends RichTextNode>(root: T, transform: (node: RichTextNode) => RichTextNode | RichTextNode[] | null): T {
	function mapChildren<N extends RichTextNode>(node: N): N {
		if (!node.content) return node;
		const content = node.content.flatMap(child => transform(mapChildren(child)) ?? []);
		return { ...node, content };
	}
	return mapChildren(root);
}

export interface PlainTextOptions {
	/** Text for custom inline nodes, by node type. */
	nodes?: Record<string, (node: RichTextNode) => string>;
	/** Inserted between block nodes. */
	blockSeparator?: string;
}

const inlineTypes = new Set(['text', 'hardBreak']);

export function toPlainText(node: RichTextNode, options: PlainTextOptions = {}): string {
	const { nodes = {}, blockSeparator = '\n' } = options;

	function isInline(current: RichTextNode): boolean {
		return inlineTypes.has(current.type) || current.type in nodes;
	}

	function render(current: RichTextNode): string {
		if (current.type == 'text') return current.text ?? '';
		if (current.type == 'hardBreak') return '\n';
		if (current.type in nodes) return nodes[current.type](current);

		const children = current.content ?? [];
		const separator = children.every(isInline) ? '' : blockSeparator;
		return children.map(render).join(separator);
	}

	return render(node);
}
