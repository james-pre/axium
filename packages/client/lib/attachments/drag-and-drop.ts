import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Icon from '../Icon.svelte';

const mimeType = 'text/x-axium-drag';

export interface Display {
	name: string;
	icon?: string;
}

function createDragImage(lead: Display, extraItems: number): HTMLElement & Disposable {
	const indicator = document.createElement('div');
	indicator.className = 'drag-indicator';
	// Keep it out of the layout/flow while it is briefly attached for snapshotting.
	indicator.style.position = 'fixed';
	indicator.style.top = '-1000px';
	indicator.style.left = '-1000px';
	indicator.style.pointerEvents = 'none';

	let icon: Record<string, any> | undefined;
	if (lead.icon) icon = mount<any, {}>(Icon, { target: indicator, props: { i: lead.icon } });

	const name = document.createElement('span');
	name.className = 'drag-name';
	name.textContent = lead.name;
	indicator.appendChild(name);

	if (extraItems) {
		const extra = document.createElement('b');
		extra.className = 'drag-count';
		extra.textContent = `+ ${extraItems}`;
		indicator.appendChild(extra);
	}

	document.body.appendChild(indicator);

	return Object.assign(indicator, {
		[Symbol.dispose]() {
			setTimeout(() => {
				if (icon) unmount(icon);
				indicator.remove();
			});
		},
	});
}

export let isActive = false;

/**
 * Make an element a draggable source.
 *
 * Grabs either the given selection (when non-empty) or just this item.
 */
export function source(type: string, selection: Iterable<string>, thisId: string, display: Display): Attachment<HTMLElement> {
	const sel = Array.from(selection);
	if (!sel.length) sel.push(thisId);

	const mime = `${mimeType}+${type.toLowerCase()}`;

	return function _attachDraggable(element: HTMLElement) {
		element.draggable = true;

		function onDragStart(e: DragEvent) {
			// Don't start drags from interactive descendants (action buttons, etc.).
			for (let node = e.target as HTMLElement | null; node && node !== element; node = node.parentElement) {
				if (node.hasAttribute('data-no-select')) {
					e.preventDefault();
					return;
				}
			}

			if (!e.dataTransfer) return;
			e.dataTransfer.setData(mime, JSON.stringify(sel));
			e.dataTransfer.effectAllowed = 'move';

			using image = createDragImage(display, sel.length - 1);
			e.dataTransfer.setDragImage(image, 0, -8);

			isActive = true;
			document.body.classList.add('dragging-items');
		}

		function onDragEnd() {
			isActive = false;
			document.body.classList.remove('dragging-items');
		}

		element.addEventListener('dragstart', onDragStart);
		element.addEventListener('dragend', onDragEnd);

		return () => {
			element.removeEventListener('dragstart', onDragStart);
			element.removeEventListener('dragend', onDragEnd);
		};
	};
}

/**
 * Register an element as a drop target for drags of the given kind.
 */
export function target<T = string>(type: string, onDrop: (items: T[]) => unknown): Attachment<HTMLElement> {
	const mime = `${mimeType}+${type.toLowerCase()}`;

	return function _attachDropTarget(element: HTMLElement) {
		let depth = 0;

		function relevant(e: DragEvent): boolean {
			return !!e.dataTransfer?.types.includes(mime);
		}

		function onDragEnter(e: DragEvent) {
			if (!relevant(e)) return;
			e.preventDefault();
			if (depth++ === 0) element.classList.add('drag-over');
		}

		function onDragOver(e: DragEvent) {
			if (!relevant(e)) return;
			// Required for the element to be a valid drop target.
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		}

		function onDragLeave(e: DragEvent) {
			if (!relevant(e)) return;
			if (--depth <= 0) {
				depth = 0;
				element.classList.remove('drag-over');
			}
		}

		function onDropEvent(e: DragEvent) {
			if (!relevant(e)) return;
			e.preventDefault();
			depth = 0;
			element.classList.remove('drag-over');

			let items: T[];
			try {
				items = JSON.parse(e.dataTransfer!.getData(mime));
			} catch {
				return;
			}
			if (Array.isArray(items) && items.length) onDrop(items);
		}

		element.addEventListener('dragenter', onDragEnter);
		element.addEventListener('dragover', onDragOver);
		element.addEventListener('dragleave', onDragLeave);
		element.addEventListener('drop', onDropEvent);

		return () => {
			element.removeEventListener('dragenter', onDragEnter);
			element.removeEventListener('dragover', onDragOver);
			element.removeEventListener('dragleave', onDragLeave);
			element.removeEventListener('drop', onDropEvent);
		};
	};
}
