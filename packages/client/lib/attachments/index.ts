/**
 * Svelte attachments
 * @see https://svelte.dev/docs/svelte/@attach
 */
import type { Attachment } from 'svelte/attachments';

export * from './context-menu.js';
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
		element.style.overflowY = 'scroll';

		function update() {
			if (!element.value) return;
			element.rows = Math.max(Math.min(element.value.split('\n').length, max), min);
		}

		if (!navigator.userAgent.includes('Firefox')) return;
		update();
		element.addEventListener('input', update);
		element.addEventListener('keyup', update);
		return () => {
			element.removeEventListener('input', update);
			element.removeEventListener('keyup', update);
		};
	};
}
