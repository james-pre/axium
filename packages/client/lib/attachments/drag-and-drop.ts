import { mount, unmount } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Icon from '../Icon.svelte';
import { SvelteSet } from 'svelte/reactivity';
import type { Selection } from './selection.js';

/** A grabbable item, used to populate the floating drag indicator. */
export interface Item {
	id: string;
	name: string;
	icon?: string;
}

/**
 * Coordinates a press-and-hold drag of one or more things onto a {@link target}.
 *
 * Things are made grabbable with the {@link source} attachment,
 * and targets accept them with {@link target}.
 *
 * While a drag is in progress a floating indicator follows the pointer showing
 * the grabbed item's name and icon, with a bold `+ N` when several are grabbed.
 *
 * The grabbed elements expose the `dragging` class for styling.
 */
export class Controller extends SvelteSet<string> implements Disposable {
	#indicator?: HTMLElement;
	#indicatorIcon?: Record<string, any>;

	/** Registered drop targets, keyed by their element. */
	readonly #targets = new Map<HTMLElement, (ids: string[]) => unknown>();

	#activeTarget?: HTMLElement;

	/** Whether a drag is currently in progress. */
	get active(): boolean {
		return this.size > 0;
	}

	_registerTarget(element: HTMLElement, onDrop: (ids: string[]) => unknown): () => void {
		this.#targets.set(element, onDrop);
		return () => this.#targets.delete(element);
	}

	/** Begin dragging the given ids, showing a floating indicator labelled for `lead`. */
	begin(ids: string[], lead: Item): void {
		if (!ids.length) return;
		for (const id of ids) this.add(id);

		const indicator = document.createElement('div');
		indicator.className = 'drag-indicator';
		if (lead.icon) this.#indicatorIcon = mount<any, {}>(Icon, { target: indicator, props: { i: lead.icon } });

		const name = document.createElement('span');
		name.className = 'drag-name';
		name.textContent = lead.name;
		indicator.appendChild(name);

		if (ids.length > 1) {
			const extra = document.createElement('b');
			extra.className = 'drag-count';
			extra.textContent = `+ ${ids.length - 1}`;
			indicator.appendChild(extra);
		}

		document.body.appendChild(indicator);
		this.#indicator = indicator;
		document.body.classList.add('dragging-items');
	}

	/** Move the floating indicator and update which drop target is under the pointer. */
	move(x: number, y: number): void {
		if (!this.#indicator) return;
		this.#indicator.style.left = x + 'px';
		this.#indicator.style.top = y + 'px';

		// Find the drop target under the pointer (ignoring the indicator itself, which is pointer-events: none).
		let target: HTMLElement | undefined;
		for (let node = document.elementFromPoint(x, y) as HTMLElement | null; node; node = node.parentElement) {
			if (this.#targets.has(node)) {
				target = node;
				break;
			}
		}

		if (target == this.#activeTarget) return;
		this.#activeTarget?.classList.remove('drag-over');
		this.#activeTarget = target;
		this.#activeTarget?.classList.add('drag-over');
	}

	/** Finish the drag, dropping onto the active target (if any), and clean up. */
	end(): void {
		const onDrop = this.#activeTarget && this.#targets.get(this.#activeTarget);
		try {
			if (onDrop && this.size) onDrop([...this]);
		} finally {
			this.dispose();
		}
	}

	/** Abort the drag without dropping. */
	cancel(): void {
		this.dispose();
	}

	dispose(): void {
		this.clear();
		this.#activeTarget?.classList.remove('drag-over');
		this.#activeTarget = undefined;
		if (this.#indicatorIcon) unmount(this.#indicatorIcon);
		this.#indicatorIcon = undefined;
		this.#indicator?.remove();
		this.#indicator = undefined;
		document.body.classList.remove('dragging-items');
	}

	[Symbol.dispose]() {
		this.dispose();
	}
}

/**
 * The default drag-and-drop controller.
 */
const defaultController = new Controller();

export { defaultController as controller };

/** How long, in milliseconds, a touch must be held before it starts a drag (rather than scrolling). */
const HOLD_DELAY = 400;

/**
 * Make an element a draggable source for a {@link Controller}.
 *
 * Pressing and dragging the pointer out of the item grabs either the current {@link Selection} (when
 * this item is part of a non-empty selection) or just this item, then follows the pointer until release.
 */
export function source(
	item: Item,
	selectedIds: Iterable<string> = [item.id],
	controller: Controller = defaultController
): Attachment<HTMLElement> {
	const selection = Array.from(selectedIds);
	if (!selection.length) selection.push(item.id);

	return function _attachDraggable(element: HTMLElement) {
		let lastX = 0,
			lastY = 0,
			started = false,
			pointerId: number | undefined,
			holdTimer: number | undefined;

		function _clearTimer() {
			clearTimeout(holdTimer);
			holdTimer = undefined;
			pointerId = undefined;
		}

		function start() {
			if (started || pointerId === undefined) return;
			started = true;

			controller.begin(selection, item);
			element.setPointerCapture(pointerId);
			controller.move(lastX, lastY);
		}

		function onPointerDown(e: PointerEvent) {
			if (e.button !== 0) return;
			for (let node = e.target as HTMLElement | null; node && node !== element; node = node.parentElement) {
				if (node.hasAttribute('data-no-select')) return;
			}
			lastX = e.clientX;
			lastY = e.clientY;
			started = false;
			pointerId = e.pointerId;

			// Touch presses scroll the list, so require a deliberate press-and-hold before grabbing.
			if (e.pointerType === 'touch') holdTimer = setTimeout(start, HOLD_DELAY);
		}

		// The drag begins once the pointer leaves the item it was pressed on.
		function onPointerLeave(e: PointerEvent) {
			if (pointerId === undefined || e.pointerId !== pointerId || started) return;
			// A touch that leaves the item before the hold fires is a scroll, not a drag.
			if (holdTimer !== undefined) return _clearTimer();

			lastX = e.clientX;
			lastY = e.clientY;
			start();
		}

		function onPointerMove(e: PointerEvent) {
			if (pointerId === undefined || e.pointerId !== pointerId || !started) return;
			lastX = e.clientX;
			lastY = e.clientY;
			e.preventDefault();
			controller.move(e.clientX, e.clientY);
		}

		function onPointerUp(e: PointerEvent) {
			if (pointerId === undefined || e.pointerId !== pointerId) return;
			if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
			_clearTimer();
			if (started) {
				e.preventDefault();
				e.stopPropagation();
				suppressClick = true;
				controller.end();
			}
			started = false;
		}

		function onPointerCancel() {
			_clearTimer();
			if (started) controller.cancel();
			started = false;
		}

		// A drag may be followed by a synthetic click; swallow it so it doesn't re-select or open the item.
		let suppressClick = false;
		function onClick(e: MouseEvent) {
			if (!suppressClick) return;
			suppressClick = false;
			e.preventDefault();
			e.stopPropagation();
		}

		element.addEventListener('pointerdown', onPointerDown);
		element.addEventListener('pointerleave', onPointerLeave);
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', onPointerUp);
		element.addEventListener('pointercancel', onPointerCancel);
		element.addEventListener('click', onClick, { capture: true });

		return () => {
			element.removeEventListener('pointerdown', onPointerDown);
			element.removeEventListener('pointerleave', onPointerLeave);
			element.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('pointerup', onPointerUp);
			element.removeEventListener('pointercancel', onPointerCancel);
			element.removeEventListener('click', onClick, { capture: true });
		};
	};
}

/**
 * Register an element as a drop target for a {@link DragController}.
 *
 * When grabbed items are released over the element, `onDrop` is called with the dragged ids. While a
 * drag hovers the element it carries the `drag-over` class.
 */
export function target(onDrop: (ids: string[]) => unknown, controller: Controller = defaultController): Attachment<HTMLElement> {
	return function _attachDropTarget(element: HTMLElement) {
		return controller._registerTarget(element, onDrop);
	};
}
