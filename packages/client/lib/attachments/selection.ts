import type { Attachment } from 'svelte/attachments';
import { SvelteSet } from 'svelte/reactivity';

/**
 * Manages a reusable, list-wide selection across items rendered with the {@link selectable} attachment.
 *
 * Click semantics (matching common file managers):
 * - Plain click: select only the clicked item, clearing the rest.
 * - Ctrl/Cmd click: toggle the clicked item's selection.
 * - Shift click: select the range between the last-clicked item and the clicked item, clearing everything outside it.
 */
export class Selection extends SvelteSet<string> {
	/** The ordered list of ids, set by the caller so ranges (shift-click) can be computed. */
	#order: string[] = [];

	/** The id of the last item interacted with, used as the anchor for shift-click ranges. */
	#anchor?: string;

	/**
	 * Update the ordered list of item ids. Call this whenever the rendered order changes
	 * (e.g. after sorting or loading a new directory).
	 */
	setOrder(ids: string[]): void {
		this.#order = ids;
		for (const id of this) if (!ids.includes(id)) this.delete(id);
		if (this.#anchor && !ids.includes(this.#anchor)) this.#anchor = undefined;
	}

	/** Clear the entire selection. */
	clear(): void {
		super.clear();
		this.#anchor = undefined;
	}

	add(id: string): this {
		super.add(id);
		this.#anchor = id;
		return this;
	}

	/** Apply selection behavior for a click on `id` with the given modifier keys. */
	handleClick(id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void {
		if (e.shiftKey && this.#anchor) {
			const start = this.#order.indexOf(this.#anchor);
			const end = this.#order.indexOf(id);
			if (start != -1 && end != -1) {
				const [lo, hi] = start < end ? [start, end] : [end, start];
				const range = new Set(this.#order.slice(lo, hi + 1));
				super.clear();
				for (const rangeId of range) super.add(rangeId);
				return;
			}
		}

		if (e.ctrlKey || e.metaKey) {
			if (this.has(id)) this.delete(id);
			else this.add(id);
			return;
		}

		super.clear();
		this.add(id);
	}
}

/**
 * Wire an element into a {@link Selection} as the item identified by `id`.
 *
 * Reflects selection state via the `selected` class and handles select-on-click (with shift/ctrl/meta
 * modifiers). The handler runs in the capture phase so it can be combined with other click handlers on
 * the element that perform navigation/preview only when the click was not a selection gesture.
 */
export function selectable(selection: Selection, id: string): Attachment<HTMLElement> {
	return function _attachSelectable(element: HTMLElement) {
		function onclick(e: MouseEvent) {
			// Let interactive descendants (action buttons, etc.) opt out of triggering selection.
			for (let node = e.target as HTMLElement | null; node && node != element; node = node.parentElement) {
				if (node.hasAttribute('data-no-select')) return;
			}

			if (e.shiftKey || e.ctrlKey || e.metaKey) {
				e.preventDefault();
				e.stopPropagation();
			}
			selection.handleClick(id, e);
		}

		element.addEventListener('click', onclick, { capture: true });

		return () => {
			element.removeEventListener('click', onclick, { capture: true });
		};
	};
}
