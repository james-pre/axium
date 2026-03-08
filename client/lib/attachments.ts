/**
 * Svelte attachments
 * @see https://svelte.dev/docs/svelte/@attach
 */
import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Icon from './Icon.svelte';

export interface ContextMenuItem {
	/** Icon name */
	i?: string;
	text: string;
	danger?: boolean;
	action(): unknown;
}

/**
 * Attach a context menu to an element with the given actions
 */
export function contextMenu(...menuItems: (ContextMenuItem | false | null | undefined)[]): Attachment<HTMLElement> {
	return function _attachContextMenu(element: HTMLElement) {
		const menu = document.createElement('div');
		menu.popover = 'auto';
		menu.className = 'context-menu';

		const mountedIcons = new Set<Record<string, any>>();

		for (const item of menuItems) {
			if (!item) continue;
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

		document.body.appendChild(menu);

		let _forcePopover = false;

		element.oncontextmenu = (e: MouseEvent) => {
			for (let node = e.target as HTMLElement | null; node && node !== element; node = node.parentElement) {
				if (node instanceof HTMLDialogElement || (node.popover && node !== menu)) return;
			}

			e.preventDefault();
			e.stopPropagation();

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
 * Dynamically resize `<textarea>`s based on content.
 * @todo Remove this once `field-sizing` works everywhere
 */
export function dynamicRows(max: number = 40, min: number = 3): Attachment<HTMLTextAreaElement> {
	return function _attachDynamicRows(element: HTMLTextAreaElement) {
		element.style.resize = 'none';
		// @ts-expect-error field-sizing is not yet in the types
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
