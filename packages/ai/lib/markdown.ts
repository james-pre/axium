import { marked } from 'marked';
import type { Attachment } from 'svelte/attachments';

declare global {
	interface SetHTMLOptions {
		sanitizer?: Sanitizer | SanitizerConfig | 'default';
	}

	interface Element {
		setHTML(html: string, options?: SetHTMLOptions): void;
	}
}

export function markdown(source: string): Attachment<HTMLElement> {
	return element => {
		element.setHTML(marked.parse(source, { async: false }));
	};
}
