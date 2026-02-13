/**
 * Svelte attachments
 * @see https://svelte.dev/docs/svelte/@attach
 */
import { mount, unmount } from 'svelte';
import Icon from './Icon.svelte';
import type { Attachment } from 'svelte/attachments';

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
export function contextMenu(...menuItems: (ContextMenuItem | false | null | undefined)[]) {
	function _attachContextMenu(element: HTMLElement) {
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
	}
	return _attachContextMenu satisfies Attachment<HTMLElement>;
}
