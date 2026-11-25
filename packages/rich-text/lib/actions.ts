import { text } from '@axium/client';
import type { Editor } from '@tiptap/core';
import type { CustomNode } from './nodes.svelte.js';

export interface RichTextContext {
	editor: Editor;
	/** The selected text */
	text: string;
	/** Replace the selection with a custom node built from the selected text. */
	wrapSelection<Data>(node: CustomNode<Data>, build: (text: string) => Data): boolean;
	/** Show the link field in the selection menu. */
	editLink(): void;
}

/** An action shown in the selection menu and the right-click menu while text is selected. */
export interface RichTextAction {
	/** Icon name */
	i: string;
	text: string;
	danger?: boolean;
	run(context: RichTextContext): unknown;
	/** Whether the action is shown highlighted, e.g. bold while the selection is bold. */
	active?(context: RichTextContext): boolean;
	/** Whether the action is available. Defaults to always. */
	visible?(context: RichTextContext): boolean;
}

function isEditable({ editor }: RichTextContext): boolean {
	return editor.isEditable;
}

function mark(i: string, label: string, name: string, toggle: (editor: Editor) => unknown): RichTextAction {
	return {
		i,
		text: label,
		run: ({ editor }) => toggle(editor),
		active: ({ editor }) => editor.isActive(name),
		visible: isEditable,
	};
}

/** Bold, italic, underline, strikethrough, code and link. */
export function formattingActions(): RichTextAction[] {
	return [
		mark('bold', text('RichText.bold'), 'bold', editor => editor.chain().focus().toggleBold().run()),
		mark('italic', text('RichText.italic'), 'italic', editor => editor.chain().focus().toggleItalic().run()),
		mark('underline', text('RichText.underline'), 'underline', editor => editor.chain().focus().toggleUnderline().run()),
		mark('strikethrough', text('RichText.strike'), 'strike', editor => editor.chain().focus().toggleStrike().run()),
		mark('code', text('RichText.code'), 'code', editor => editor.chain().focus().toggleCode().run()),
		{
			i: 'link',
			text: text('RichText.link'),
			run: context => context.editLink(),
			active: ({ editor }) => editor.isActive('link'),
			visible: isEditable,
		},
	];
}
