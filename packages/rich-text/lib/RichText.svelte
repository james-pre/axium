<script lang="ts">
	import { contextMenu, type ContextMenuEntry } from '@axium/client/attachments';
	import { emptyDocument, type RichTextDocument } from '@axium/rich-text';
	import { Editor, Extension } from '@tiptap/core';
	import { BubbleMenu } from '@tiptap/extension-bubble-menu';
	import type { EditorState } from '@tiptap/pm/state';
	import { mount, unmount, untrack } from 'svelte';
	import { formattingActions, type RichTextAction, type RichTextContext } from './actions.js';
	import { createExtensions, type RichTextPreset } from './extensions.js';
	import './locales.js';
	import type { CustomNode } from './nodes.svelte.js';
	import SelectionMenu from './SelectionMenu.svelte';

	let {
		content = $bindable(emptyDocument()),
		preset = 'document',
		nodes = [],
		actions = formattingActions(),
		editable = true,
		delay = 1000,
		onchange,
		class: className,
	}: {
		/** Replacing the document resets the editor and discards changes not yet passed to `onchange`. */
		content?: RichTextDocument;
		/** Only read when the editor is created. */
		preset?: RichTextPreset;
		/** Only read when the editor is created. */
		nodes?: CustomNode<any>[];
		actions?: RichTextAction[];
		editable?: boolean;
		/** How long to wait after the last edit before calling `onchange`, in milliseconds. */
		delay?: number;
		onchange?(content: RichTextDocument): unknown;
		class?: string;
	} = $props();

	const externalUpdate = 'axium-rich-text-external';

	let editor = $state.raw<Editor>();
	let editorState = $state.raw<EditorState>();
	const menu = $state({ linking: false });

	let emitted: RichTextDocument | undefined;
	let pendingContent: RichTextDocument | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function createContext(instance: Editor): RichTextContext {
		const { from, to } = instance.state.selection;
		return {
			editor: instance,
			text: instance.state.doc.textBetween(from, to, '\n'),
			wrapSelection,
			editLink() {
				menu.linking = true;
				instance.view.focus();
			},
		};
	}

	function visibleActions(context: RichTextContext): RichTextAction[] {
		return actions.filter(action => action.visible?.(context) ?? true);
	}

	const context = $derived(editorState && editor && createContext(editor));
	const menuActions = $derived(context ? visibleActions(context) : []);

	function contextEntries(): ContextMenuEntry[] {
		if (!editor || editor.state.selection.empty) return [];
		const current = createContext(editor);
		return visibleActions(current).map(action => ({
			i: action.i,
			text: action.text,
			danger: action.danger,
			action: () => action.run(current),
		}));
	}

	const LinkShortcut = Extension.create({
		name: 'axiumLinkShortcut',
		addKeyboardShortcuts() {
			return {
				'Mod-k': () => {
					if (this.editor.state.selection.empty || !this.editor.isEditable) return false;
					menu.linking = true;
					return true;
				},
			};
		},
	});

	function attachEditor(element: HTMLElement) {
		return untrack(() => {
			const menuElement = document.createElement('div');
			menuElement.popover = 'manual';
			menuElement.className = 'rich-text-menu';

			const instance = new Editor({
				element,
				content,
				editable,
				extensions: [
					...createExtensions(preset, nodes),
					LinkShortcut,
					BubbleMenu.configure({
						element: menuElement,
						shouldShow: ({ editor, state }) =>
							!state.selection.empty && (menu.linking || visibleActions(createContext(editor)).length > 0),
						options: { strategy: 'fixed', placement: 'top', onShow: () => menuElement.showPopover() },
					}),
				],
				onTransaction({ editor, transaction }) {
					if (!transaction.docChanged && !editorState?.selection.eq(editor.state.selection)) menu.linking = false;
					editorState = editor.state;
				},
				onUpdate({ editor, transaction }) {
					if (!transaction.docChanged) return;
					content = emitted = editor.getJSON() as RichTextDocument;
					if (transaction.getMeta(externalUpdate)) return;
					pendingContent = content;
					clearTimeout(timer);
					timer = setTimeout(flush, delay);
				},
			});

			emitted = content;
			editor = instance;
			editorState = instance.state;

			const selectionMenu = mount(SelectionMenu, {
				target: menuElement,
				props: {
					get context() {
						return context;
					},
					get actions() {
						return menuActions;
					},
					menu,
				},
			});

			return () => {
				flush();
				unmount(selectionMenu);
				instance.destroy();
				menuElement.remove();
				editor = undefined;
			};
		});
	}

	$effect(() => {
		const next = content;
		if (!editor || next === emitted) return;
		emitted = next;
		pendingContent = undefined;
		clearTimeout(timer);
		untrack(() => editor!.commands.setContent(next, { emitUpdate: false }));
	});

	$effect(() => {
		editor?.setEditable(editable);
	});

	/** Call `onchange` now with any changes still waiting for the delay. */
	export function flush(): void {
		clearTimeout(timer);
		timer = undefined;
		if (!pendingContent) return;
		const changed = pendingContent;
		pendingContent = undefined;
		onchange?.(changed);
	}

	/**
	 * Change the data of every `node` in the document without moving the cursor or adding to undo history.
	 * Nodes are visited in document order, and `index` counts only nodes of this type.
	 * Returning `undefined` from `update` leaves that node unchanged.
	 * This updates `content` but does not call `onchange`.
	 */
	export function updateNodes<Data>(node: CustomNode<Data>, update: (data: Data, index: number) => Data | undefined): void {
		if (!editor) return;
		const { tr, doc } = editor.state;
		let index = 0;
		doc.descendants((child, position) => {
			if (child.type.name != node.name) return;
			const data = update(child.attrs.data, index++);
			if (data !== undefined) tr.setNodeMarkup(position, undefined, { data });
		});
		if (!tr.docChanged) return;
		editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta(externalUpdate, true));
	}

	/** Replace the selection with a `node` built from the selected text. */
	export function wrapSelection<Data>(node: CustomNode<Data>, build: (text: string) => Data): boolean {
		if (!editor || editor.state.selection.empty) return false;
		const { from, to } = editor.state.selection;
		const data = build(editor.state.doc.textBetween(from, to, '\n'));
		return editor.chain().focus().insertContentAt({ from, to }, { type: node.name, attrs: { data } }).run();
	}

	export function getEditor(): Editor | undefined {
		return editor;
	}
</script>

<div class={['rich-text', className]} {@attach attachEditor} {@attach contextMenu(contextEntries)}></div>

<style>
	.rich-text :global {
		.ProseMirror {
			outline: none;
			min-height: 100%;
			line-height: 1.5;
		}

		p,
		ul,
		ol,
		blockquote,
		pre,
		table {
			margin: 0 0 0.75em;
		}

		h1,
		h2,
		h3,
		h4,
		h5,
		h6 {
			margin: 1em 0 0.5em;
			line-height: 1.25;
		}

		a {
			color: var(--fg-accent);
			text-decoration: underline;
		}

		blockquote {
			border-left: var(--border-accent);
			border-left-width: 3px;
			padding-left: 1em;
		}

		code {
			font-family: monospace;
			background-color: var(--bg-alt);
			border-radius: 0.25em;
			padding: 0.1em 0.3em;
		}

		pre {
			background-color: var(--bg-alt);
			border-radius: 0.5em;
			padding: 0.75em 1em;
			overflow-x: auto;

			code {
				background: none;
				padding: 0;
			}
		}

		hr {
			border: none;
			border-top: var(--border-accent);
			margin: 1.5em 0;
		}

		ul[data-type='taskList'] {
			list-style: none;
			padding-left: 0;

			ul[data-type='taskList'] {
				padding-left: 1.75em;
			}
		}

		li[data-type='taskItem'] {
			display: flex;
			align-items: flex-start;
			gap: 0.5em;

			> div:last-child {
				flex: 1;
			}

			&[data-checked='true'] > div:last-child {
				opacity: 0.6;
				text-decoration: line-through;
			}

			&[data-checked='false'] label.checkbox .Icon {
				visibility: hidden;
			}
		}

		.task-checkbox {
			display: flex;
			align-items: center;
			height: 1.5em;
			user-select: none;
		}

		table {
			border-collapse: collapse;
			width: 100%;
		}

		th,
		td {
			border: var(--border-accent);
			padding: 0.25em 0.5em;
			vertical-align: top;
			text-align: left;

			> p {
				margin: 0;
			}
		}

		th {
			background-color: var(--bg-alt);
		}

		.selectedCell {
			background-color: var(--bg-accent);
		}

		.rich-text-node {
			border-radius: 0.25em;
		}

		.ProseMirror-selectednode {
			outline: 2px solid var(--fg-accent);
		}
	}

	@media print {
		:global(.rich-text-menu, .rich-text-suggestions) {
			display: none;
		}

		.rich-text :global {
			color: #000;

			a {
				color: inherit;
			}

			code,
			pre,
			th {
				background-color: #eee;
			}

			blockquote,
			th,
			td,
			hr {
				border-color: #999;
			}

			h1,
			h2,
			h3,
			h4,
			h5,
			h6 {
				break-after: avoid;
			}

			pre,
			blockquote,
			tr,
			li,
			.rich-text-node {
				break-inside: avoid;
			}

			.ProseMirror-selectednode {
				outline: none;
			}
		}
	}
</style>
