import { debug, errorText, useProgress } from 'ioium';
import { text } from '@axium/client/locales';
import { animate, onAnimationEnd } from '@axium/client/web';
import Icon from './Icon.svelte';
import { mount } from 'svelte';
import { $ZodError, prettifyError } from 'zod/v4/core';

const list = document.querySelector<HTMLDivElement>('#toasts')!;

const toastIcons = {
	success: 'check',
	warning: 'regular/triangle-exclamation',
	error: 'octagon-xmark',
	info: 'regular/circle-info',
};

/** Used to determine icon and styling */
export type ToastType = 'plain' | keyof typeof toastIcons;

const durationMultiplier = {
	warning: 1.25,
	error: 1.5,
} as Record<ToastType, number>;

export async function toast(type: ToastType, message: any): Promise<void> {
	if (message instanceof $ZodError) console.error('[toast]', prettifyError(message));
	else if (message instanceof Error) console.error('[toast]', message);
	const text = errorText(message);

	const toast = document.createElement('div');
	toast.classList.add('toast', 'icon-text', type);
	if (type != 'plain') mount(Icon, { target: toast, props: { i: toastIcons[type] } });

	const span = document.createElement('span');
	span.textContent = text;
	toast.appendChild(span);

	list.appendChild(toast);

	async function dismiss() {
		debug('Toast dismissed');
		await animate(toast, 'var(--A-slide-out-right)');
		toast.remove();
	}

	let persisted = false;

	function persist() {
		debug('Toast persisted');
		persisted = true;
		toast.onclick = null;
		toast.style.animation = 'none';
		toast.style.opacity = '1';

		const button = document.createElement('button');
		button.classList.add('reset');
		button.onclick = dismiss;
		mount(Icon, { target: button, props: { i: 'xmark-large' } });
		toast.appendChild(button);
	}

	await onAnimationEnd(toast);

	if (message && message instanceof Error) return persist();

	/**
	 * @see https://ux.stackexchange.com/a/85898
	 */
	const duration = Math.min(Math.max(text.length * 50 * (durationMultiplier[type] || 1), 2000), 7000);

	toast.onclick = persist;
	await animate(toast, `fade-subtle ${duration}ms ease reverse forwards`);
	if (!persisted) await dismiss();
	else debug('Toast not auto-dismissed due to persistence');
}

export async function toastStatus(promise: Promise<unknown>, successMessage: string = text('generic.success')): Promise<void> {
	try {
		await promise;
		await toast('success', successMessage);
	} catch (err) {
		await toast('error', err);
	}
}

export interface ProgressToast extends Disposable {
	/** Aborted when the toast's cancel button is clicked */
	readonly signal: AbortSignal;
	progress(this: void, value: number, max: number, message?: any): void;
	done(this: void): void;
}

let activeProgressToasts = 0;

function warnBeforeUnload(e: BeforeUnloadEvent) {
	e.preventDefault();
}

/**
 * Show an operation's progress in its own toast until it is done.
 * Leaving the page asks for confirmation while any progress toast is shown.
 */
export function progressToast(message: string, cancellable: boolean = true): ProgressToast {
	const controller = new AbortController();

	const toast = document.createElement('div');
	toast.classList.add('toast', 'progress');

	const header = document.createElement('div');
	header.classList.add('toast-header');
	toast.appendChild(header);

	const main = document.createElement('span');
	main.textContent = message;
	header.appendChild(main);

	if (cancellable) {
		const cancel = document.createElement('button');
		cancel.classList.add('reset');
		cancel.onclick = () => controller.abort();
		mount(Icon, { target: cancel, props: { i: 'xmark-large' } });
		header.appendChild(cancel);
	}

	const subtle = document.createElement('span');
	subtle.classList.add('subtle');
	toast.appendChild(subtle);

	const bar = document.createElement('progress');
	toast.appendChild(bar);

	list.appendChild(toast);
	if (!activeProgressToasts++) addEventListener('beforeunload', warnBeforeUnload);

	let isDone = false;

	return {
		signal: controller.signal,
		progress(value, max, message) {
			bar.value = value;
			bar.max = max;
			subtle.textContent = message == undefined ? '' : String(message);
		},
		done() {
			if (isDone) return;
			isDone = true;
			toast.remove();
			if (!--activeProgressToasts) removeEventListener('beforeunload', warnBeforeUnload);
		},
		[Symbol.dispose]() {
			this.done();
		},
	};
}

let ioProgress: ProgressToast | undefined;

useProgress({
	start(message: string): void {
		ioProgress?.done();
		ioProgress = progressToast(message, false);
	},
	progress(value: number, max: number, message?: any): void {
		ioProgress?.progress(value, max, message);
	},
	done(): void {
		ioProgress?.done();
		ioProgress = undefined;
	},
});

Object.assign(globalThis, { toast, toastStatus });
