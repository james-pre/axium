import { Node } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount, type Snippet } from 'svelte';
import type * as z from 'zod';
import NodeView from './NodeView.svelte';
import SuggestionList from './SuggestionList.svelte';

export interface CustomNodeProps<Data> {
	data: Data;
	selected: boolean;
	editable: boolean;
}

export interface SuggestionItem<Data> {
	text: string;
	/** Icon name */
	i?: string;
	data: Data;
}

export interface CustomNodeSuggestions<Data> {
	/** Typing this character opens the suggestion list. */
	char: string;
	items(query: string, signal: AbortSignal): SuggestionItem<Data>[] | Promise<SuggestionItem<Data>[]>;
}

/** The element a node is copied as, so other apps keep something meaningful, like a link. */
export interface CustomNodeHTML {
	tag?: string;
	attributes?: Record<string, string>;
}

export interface CustomNodeOptions<Data> {
	/** The node's type in the document JSON. */
	name: string;
	/** Validates data parsed from pasted HTML. */
	schema: z.ZodType<Data>;
	render: Snippet<[CustomNodeProps<Data>]>;
	/** Plain text for the clipboard and plain-text output. */
	text(data: Data): string;
	html?(data: Data): CustomNodeHTML;
	suggest?: CustomNodeSuggestions<Data>;
	/** Transforms pasted copies of the node, or drops them by returning `null`. */
	paste?(data: Data): Data | null;
}

export interface CustomNode<Data> extends CustomNodeOptions<Data> {
	extension: Node;
}

/**
 * Define an atomic inline node whose `data` is stored in the document unchanged, as `{ type: name, attrs: { data } }`.
 */
export function defineNode<Data>(options: CustomNodeOptions<Data>): CustomNode<Data> {
	const { name, schema } = options;

	function parseData(element: HTMLElement): { data: Data } | false {
		try {
			const result = schema.safeParse(JSON.parse(element.getAttribute('data-attributes') ?? 'null'));
			return result.success ? { data: result.data } : false;
		} catch {
			return false;
		}
	}

	function transformPasted(fragment: Fragment): Fragment {
		const children: ProseMirrorNode[] = [];
		fragment.forEach(child => {
			if (child.type.name != name) {
				children.push(child.isLeaf ? child : child.copy(transformPasted(child.content)));
				return;
			}
			const data = options.paste!(child.attrs.data);
			if (data !== null) children.push(child.type.create({ data }));
		});
		return Fragment.fromArray(children);
	}

	const extension = Node.create({
		name,
		group: 'inline',
		inline: true,
		atom: true,
		selectable: true,
		draggable: true,

		addAttributes() {
			return { data: { default: null, rendered: false } };
		},

		parseHTML() {
			return [{ tag: `[data-type="${name}"]`, priority: 100, getAttrs: parseData }];
		},

		renderHTML({ node }) {
			const { tag = 'span', attributes = {} } = options.html?.(node.attrs.data) ?? {};
			return [
				tag,
				{ ...attributes, 'data-type': name, 'data-attributes': JSON.stringify(node.attrs.data) },
				options.text(node.attrs.data),
			];
		},

		renderText({ node }) {
			return options.text(node.attrs.data);
		},

		addNodeView() {
			return ({ node, editor }) => {
				const dom = document.createElement('span');
				dom.className = 'rich-text-node';
				dom.dataset.type = name;
				dom.contentEditable = 'false';

				const props = $state<CustomNodeProps<Data>>({
					data: node.attrs.data,
					selected: false,
					editable: editor.isEditable,
				});

				const view = mount(NodeView<Data>, { target: dom, props: { render: options.render, props } });

				function syncEditable() {
					props.editable = editor.isEditable;
				}
				editor.on('update', syncEditable);

				return {
					dom,
					update(updated) {
						if (updated.type !== node.type) return false;
						props.data = updated.attrs.data;
						return true;
					},
					selectNode() {
						props.selected = true;
						dom.classList.add('ProseMirror-selectednode');
					},
					deselectNode() {
						props.selected = false;
						dom.classList.remove('ProseMirror-selectednode');
					},
					ignoreMutation: () => true,
					destroy() {
						editor.off('update', syncEditable);
						unmount(view);
					},
				};
			};
		},

		addProseMirrorPlugins() {
			const plugins: Plugin[] = [];

			if (options.paste) {
				plugins.push(
					new Plugin({
						key: new PluginKey(`${name}-paste`),
						props: {
							transformPasted: slice =>
								new Slice(transformPasted(slice.content), slice.openStart, slice.openEnd),
						},
					})
				);
			}

			if (options.suggest) {
				const { char, items } = options.suggest;
				plugins.push(
					Suggestion<SuggestionItem<Data>, SuggestionItem<Data>>({
						editor: this.editor,
						pluginKey: new PluginKey(`${name}-suggestion`),
						char,
						items: ({ query, signal }) => items(query, signal),
						command({ editor, range, props: item }) {
							editor
								.chain()
								.focus()
								.insertContentAt(range, [
									{ type: name, attrs: { data: item.data } },
									{ type: 'text', text: ' ' },
								])
								.run();
						},
						floatingUi: { strategy: 'fixed' },
						render: renderSuggestions<Data>,
					})
				);
			}

			return plugins;
		},
	});

	return { ...options, extension };
}

function renderSuggestions<Data>() {
	const element = document.createElement('div');
	element.popover = 'manual';
	element.className = 'rich-text-suggestions';

	const suggestions = $state<{ items: SuggestionItem<Data>[]; loading: boolean; select(item: SuggestionItem<Data>): void }>({
		items: [],
		loading: false,
		select() {},
	});

	let list: { keydown(event: KeyboardEvent): boolean } | undefined;
	let removePositioning: (() => void) | undefined;

	function sync(props: SuggestionProps<SuggestionItem<Data>, SuggestionItem<Data>>) {
		suggestions.items = props.items;
		suggestions.loading = props.loading;
		suggestions.select = props.command;
	}

	return {
		onStart(props: SuggestionProps<SuggestionItem<Data>, SuggestionItem<Data>>) {
			sync(props);
			list = mount(SuggestionList<Data>, { target: element, props: { suggestions } });
			removePositioning = props.mount(element);
			element.showPopover();
		},
		onUpdate: sync,
		onKeyDown({ event }: { event: KeyboardEvent }) {
			return list?.keydown(event) ?? false;
		},
		onExit() {
			removePositioning?.();
			if (list) unmount(list);
			list = undefined;
			element.remove();
		},
	};
}
