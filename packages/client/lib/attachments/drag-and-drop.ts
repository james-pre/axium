import { mount, unmount, type Component } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Icon from '../Icon.svelte';

const mimeType = 'text/x-axium-drag';

export interface Display {
	name: string;
	icon?: string;
}

function createIndicator(display: Display, extraItems: number): HTMLElement {
	const indicator = document.createElement('div');
	indicator.className = 'drag-indicator';

	const icon = display.icon && mount(Icon, { target: indicator, props: { i: display.icon } });

	const name = document.createElement('span');
	name.className = 'drag-name';
	name.textContent = display.name;
	indicator.appendChild(name);

	if (extraItems) {
		const extra = document.createElement('b');
		extra.className = 'drag-count';
		extra.textContent = `+ ${extraItems}`;
		indicator.appendChild(extra);
	}

	document.body.appendChild(indicator);

	const remove = indicator.remove.bind(indicator);
	return Object.assign(indicator, {
		remove() {
			if (icon) unmount(icon);
			remove();
		},
	});
}

const emptyImage = new Image();
emptyImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export let isActive = false;

/**
 * Make an element a draggable source.
 *
 * Grabs either the given selection (when non-empty) or just this item.
 */
export function source<T = string>(type: string, selection: Iterable<T>, thisValue: T, display: Display): Attachment<HTMLElement> {
	const sel = Array.from(selection);
	if (!sel.length) sel.push(thisValue);

	return function _attachDraggable(element: HTMLElement) {
		element.draggable = true;

		let indicator: HTMLElement;

		function onDragOver(e: DragEvent) {
			indicator.style.translate = `${e.clientX}px ${e.clientY}px`;
		}

		function onDragStart(e: DragEvent) {
			for (let node = e.target as HTMLElement | null; node && node !== element; node = node.parentElement) {
				if (node.hasAttribute('data-no-select')) {
					e.preventDefault();
					return;
				}
			}

			if (!e.dataTransfer) return;
			e.dataTransfer.setData(`${mimeType}+${type.toLowerCase()}`, JSON.stringify(sel));
			e.dataTransfer.effectAllowed = 'move';

			e.dataTransfer.setDragImage(emptyImage, 0, 0);

			isActive = true;
			indicator = createIndicator(display, sel.length - 1);
			indicator.style.translate = `${e.clientX}px ${e.clientY}px`;
			document.body.classList.add('dragging-items');
			document.addEventListener('dragover', onDragOver);
		}

		function onDragEnd() {
			isActive = false;
			document.removeEventListener('dragover', onDragOver);
			indicator.remove();
			document.body.classList.remove('dragging-items');
		}

		element.addEventListener('dragstart', onDragStart);
		element.addEventListener('dragend', onDragEnd);

		return () => {
			document.removeEventListener('dragover', onDragOver);
			element.removeEventListener('dragstart', onDragStart);
			element.removeEventListener('dragend', onDragEnd);
		};
	};
}

/**
 * Register an element as a drop target for drags of the given kind.
 */
export function target<T = string>(type: string, onDrop: (items: T[]) => unknown, exclude?: T): Attachment<HTMLElement> {
	const mime = `${mimeType}+${type.toLowerCase()}`;

	return function _attachDropTarget(element: HTMLElement) {
		let depth = 0;

		function ignore(e: DragEvent): boolean {
			return !e.dataTransfer?.types.includes(mime);
		}

		function onDragEnter(e: DragEvent) {
			if (ignore(e)) return;
			e.preventDefault();
			if (depth++ === 0) element.classList.add('drag-over');
		}

		function onDragOver(e: DragEvent) {
			if (ignore(e)) return;
			// Required for the element to be a valid drop target.
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		}

		function onDragLeave(e: DragEvent) {
			if (ignore(e)) return;
			if (--depth <= 0) {
				depth = 0;
				element.classList.remove('drag-over');
			}
		}

		function onDropEvent(e: DragEvent) {
			if (ignore(e)) return;
			e.preventDefault();
			depth = 0;
			element.classList.remove('drag-over');

			let items: T[];
			try {
				items = JSON.parse(e.dataTransfer!.getData(mime));
			} catch {
				return;
			}
			if (!Array.isArray(items)) return;
			const index = exclude ? items.indexOf(exclude) : -1;
			if (index !== -1) items.splice(index, 1);
			if (items.length) onDrop(items);
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

function notUpload(e: DragEvent): boolean {
	return !e.dataTransfer?.types.includes('Files');
}

/**
 * Register an element as a target for files dragged in from the system file manager.
 */
export function uploadTarget(label: string, onDrop: (entries: FileSystemEntry[]) => unknown): Attachment<HTMLElement> {
	return function _attachUploadTarget(element: HTMLElement) {
		let depth = 0,
			indicator: HTMLElement | undefined,
			icon: {} | undefined;

		function hide() {
			depth = 0;
			element.classList.remove('drag-over');
			if (icon) unmount(icon);
			indicator?.remove();
		}

		function onDragEnter(e: DragEvent) {
			if (notUpload(e)) return;
			// Stop drag events from bubbling so the innermost upload target wins
			e.preventDefault();
			e.stopPropagation();
			if (depth++ !== 0) return;
			element.classList.add('drag-over');

			indicator = document.createElement('div');
			indicator.className = 'drag-upload-indicator';
			icon = mount(Icon, { target: indicator, props: { i: 'upload' } });

			const text = document.createElement('span');
			text.textContent = label;
			indicator.appendChild(text);

			document.body.appendChild(indicator);
		}

		function onDragOver(e: DragEvent) {
			if (notUpload(e)) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		}

		function onDragLeave(e: DragEvent) {
			if (notUpload(e)) return;
			e.stopPropagation();
			if (--depth <= 0) hide();
		}

		function onDropEvent(e: DragEvent) {
			if (notUpload(e)) return;
			e.preventDefault();
			e.stopPropagation();
			hide();

			const entries: FileSystemEntry[] = [];
			for (const item of e.dataTransfer!.items) {
				const entry = item.webkitGetAsEntry();
				if (entry) entries.push(entry);
			}
			if (entries.length) onDrop(entries);
		}

		element.addEventListener('dragenter', onDragEnter);
		element.addEventListener('dragover', onDragOver);
		element.addEventListener('dragleave', onDragLeave);
		element.addEventListener('drop', onDropEvent);

		return () => {
			hide();
			element.removeEventListener('dragenter', onDragEnter);
			element.removeEventListener('dragover', onDragOver);
			element.removeEventListener('dragleave', onDragLeave);
			element.removeEventListener('drop', onDropEvent);
		};
	};
}
