/**
 * Svelte attachments
 * @see https://svelte.dev/docs/svelte/@attach
 */
import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Icon from './Icon.svelte';
import { SvelteSet } from 'svelte/reactivity';

export interface ContextMenuItem {
	/** Icon name */
	i?: string;
	text: string;
	danger?: boolean;
	action(): unknown;
}

/** A non-interactive label, e.g. to describe what it acts on. */
export interface ContextMenuHeader {
	header: string;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuHeader | false | null | undefined;

/**
 * Attach a context menu to an element with the given actions.
 *
 * Pass a function instead of a fixed list to have the menu rebuilt every time it opens — useful when
 * the available actions or their labels depend on state that changes after the menu is attached (e.g. a
 * selection).
 */
export function contextMenu(...menuItems: ContextMenuEntry[] | [() => ContextMenuEntry[]]): Attachment<HTMLElement> {
	return function _attachContextMenu(element: HTMLElement) {
		const menu = document.createElement('div');
		menu.popover = 'auto';
		menu.className = 'context-menu';

		const mountedIcons = new Set<Record<string, any>>();

		function build(items: ContextMenuEntry[]) {
			for (const item of items) {
				if (!item) continue;

				if ('header' in item) {
					const header = document.createElement('div');
					header.classList.add('menu-header');
					header.appendChild(document.createTextNode(item.header));
					menu.appendChild(header);
					continue;
				}

				const div = document.createElement('div');
				div.classList.add('icon-text', 'menu-item');
				if (item.danger) div.classList.add('danger');

				div.onclick = e => {
					e.stopPropagation();
					menu.hidePopover();
					item.action();
				};

				if (item.i) mountedIcons.add(mount<any, {}>(Icon, { target: div, props: { i: item.i } }));

				div.appendChild(document.createTextNode(item.text));

				menu.appendChild(div);
			}
		}

		if (typeof menuItems[0] != 'function') build(menuItems as ContextMenuEntry[]);

		document.body.appendChild(menu);

		let _forcePopover = false;

		element.oncontextmenu = (e: MouseEvent) => {
			for (let node = e.target as HTMLElement | null; node && node !== element; node = node.parentElement) {
				if (node instanceof HTMLDialogElement || (node.popover && node !== menu)) return;
			}

			e.preventDefault();
			e.stopPropagation();

			if (typeof menuItems[0] == 'function') {
				for (const icon of mountedIcons) unmount(icon);
				mountedIcons.clear();
				menu.replaceChildren();
				build(menuItems[0]());
			}

			menu.showPopover();
			_forcePopover = true;

			const x = e.clientX;
			const y = e.clientY;

			menu.style.left = x + 'px';
			menu.style.top = y + 'px';

			const rect = menu.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				menu.style.left = '';
				menu.style.right = window.innerWidth - x + 'px';
			}
			if (rect.bottom > window.innerHeight) {
				menu.style.top = '';
				menu.style.bottom = window.innerHeight - y + 'px';
			}
		};

		/**
		 * Workaround for https://github.com/whatwg/html/issues/10905
		 * @todo Remove when the problem is fixed.
		 */
		element.onpointerup = (e: PointerEvent) => {
			if (!_forcePopover) return;
			e.stopPropagation();
			e.preventDefault();
			menu.togglePopover();
			_forcePopover = false;
		};

		return function _disposeContextMenu() {
			for (const icon of mountedIcons) unmount(icon);
			menu.remove();
		};
	};
}

/**
 * Manages a reusable, list-wide selection across items rendered with the {@link selectable} attachment.
 *
 * Click semantics (matching common file managers):
 * - Plain click: select only the clicked item, clearing the rest.
 * - Ctrl/Cmd click: toggle the clicked item's selection.
 * - Shift click: select the range between the last-clicked item and the clicked item, clearing everything outside it.
 */
export class Selection {
	/** The currently selected ids, in no particular order. */
	readonly ids = new SvelteSet<string>();

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
		for (const id of this.ids) if (!ids.includes(id)) this.ids.delete(id);
		if (this.#anchor && !ids.includes(this.#anchor)) this.#anchor = undefined;
	}

	/** Whether the given id is currently selected. */
	has(id: string): boolean {
		return this.ids.has(id);
	}

	/** Clear the entire selection. */
	clear(): void {
		this.ids.clear();
		this.#anchor = undefined;
	}

	/** Apply selection behavior for a click on `id` with the given modifier keys. */
	handleClick(id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void {
		if (e.shiftKey && this.#anchor) {
			const start = this.#order.indexOf(this.#anchor);
			const end = this.#order.indexOf(id);
			if (start != -1 && end != -1) {
				const [lo, hi] = start < end ? [start, end] : [end, start];
				const range = new Set(this.#order.slice(lo, hi + 1));
				this.ids.clear();
				for (const rangeId of range) this.ids.add(rangeId);
				return;
			}
		}

		if (e.ctrlKey || e.metaKey) {
			if (this.ids.has(id)) this.ids.delete(id);
			else this.ids.add(id);
			this.#anchor = id;
			return;
		}

		this.ids.clear();
		this.ids.add(id);
		this.#anchor = id;
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
		const onclick = (e: MouseEvent) => {
			// Let interactive descendants (action buttons, etc.) opt out of triggering selection.
			for (let node = e.target as HTMLElement | null; node && node != element; node = node.parentElement) {
				if (node.hasAttribute('data-no-select')) return;
			}

			if (e.shiftKey || e.ctrlKey || e.metaKey) {
				e.preventDefault();
				e.stopPropagation();
			}
			selection.handleClick(id, e);
		};

		element.addEventListener('click', onclick, { capture: true });

		return () => {
			element.removeEventListener('click', onclick, { capture: true });
		};
	};
}

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

/**
 * Enabled the use of back gestures to close dialogs
 */
export function closeOnBackGesture(element: HTMLDialogElement) {
	if (!globalThis.history) {
		throw new Error('Can not attach back gesture handling because the History API is unavailable');
	}

	const showModal = element.showModal.bind(element);

	let closedByBack = false,
		historyKey = Math.random().toString(16).slice(2);

	element.showModal = () => {
		closedByBack = false;
		/* popstate's state will be the "upcoming" state.
		i.e, the state after having pushed 1 then 2 would be 1 */
		history.replaceState(historyKey, '');
		history.pushState(null, '');
		showModal();
	};

	element.addEventListener('close', () => {
		if (closedByBack) return;
		history.replaceState(null, '');
	});

	window.addEventListener('popstate', e => {
		if (e.state != historyKey) return;
		closedByBack = true;
		element.close();
	});
}
closeOnBackGesture satisfies Attachment<HTMLDialogElement>;
