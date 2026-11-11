import { ClipboardCopy } from '@axium/client/components';
import { marked } from 'marked';
import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';

declare global {
	interface SetHTMLOptions {
		sanitizer?: Sanitizer | SanitizerConfig | 'default';
	}

	interface Element {
		setHTML(html: string, options?: SetHTMLOptions): void;
	}
}

/** Renders sanitized Markdown, with a copy button on each code block */
export function markdown(source: string): Attachment<HTMLElement> {
	return element => {
		element.setHTML(marked.parse(source, { async: false }));

		const buttons: ReturnType<typeof mount>[] = [];

		for (const pre of element.querySelectorAll('pre')) {
			const block = document.createElement('div');
			block.className = 'code-block';
			pre.replaceWith(block);
			block.append(pre);

			const corner = document.createElement('div');
			corner.className = 'code-copy';
			block.append(corner);

			buttons.push(mount(ClipboardCopy, { target: corner, props: { value: pre.textContent ?? '' } }));
		}

		return () => {
			for (const button of buttons) void unmount(button);
		};
	};
}
