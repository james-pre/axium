import { isMobile } from '@axium/client/gui';
import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Icon from '../Icon.svelte';

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

				if (item.i) mountedIcons.add(mount(Icon, { target: div, props: { i: item.i } }));

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

			if (isMobile()) return;

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
