/**
 * Svelte attachments
 * @see https://svelte.dev/docs/svelte/@attach
 */
import type { Attachment } from 'svelte/attachments';

export * from './context-menu.js';
export * as drag from './drag-and-drop.js';
export * from './gestures.js';
export * from './selection.js';

/**
 * Dynamically resize `<textarea>`s based on content.
 * @todo Remove this once `field-sizing` works everywhere
 */
export function dynamicRows(max: number = 40, min: number = 3): Attachment<HTMLTextAreaElement> {
	return function _attachDynamicRows(element: HTMLTextAreaElement) {
		element.style.resize = 'none';
		element.style.fieldSizing = 'content';
		element.style.height = 'max-content';
		element.style.overflowY = 'auto';

		/** Counts wrapped lines as well as explicit ones. */
		function update() {
			element.rows = 2;
			const twoRows = element.clientHeight;
			element.rows = 1;
			const oneRow = element.clientHeight;
			const lines = 1 + Math.round((element.scrollHeight - oneRow) / (twoRows - oneRow));
			element.rows = Math.max(Math.min(lines, max), min);
		}

		if (CSS.supports('field-sizing', 'content')) return;
		update();
		element.addEventListener('input', update);
		let width = element.clientWidth;
		const resize = new ResizeObserver(() => {
			if (element.clientWidth == width) return;
			width = element.clientWidth;
			update();
		});
		resize.observe(element);
		return () => {
			element.removeEventListener('input', update);
			resize.disconnect();
		};
	};
}
