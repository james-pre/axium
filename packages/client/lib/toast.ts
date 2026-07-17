import { debug, errorText, useProgress } from 'ioium';
import { text } from '@axium/client/locales';
import { animate, onAnimationEnd } from '@axium/client/gui';
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

let progressToast: HTMLDivElement | undefined,
	progressMain: HTMLSpanElement,
	progressMessage: HTMLSpanElement,
	progressBar: HTMLProgressElement,
	progressCancelButton: HTMLButtonElement,
	progressCancel: (() => void) | undefined;

function warnBeforeUnload(e: BeforeUnloadEvent) {
	e.preventDefault();
}

/**
 * Register a callback used to cancel the operation shown in the progress toast.
 * The toast's cancel button is only shown while a callback is registered.
 */
export function setProgressCancel(cancel?: () => void): void {
	progressCancel = cancel;
	if (progressToast) progressCancelButton.style.display = cancel ? '' : 'none';
}

useProgress({
	start(message: string): void {
		if (!progressToast) {
			progressToast = document.createElement('div');
			progressToast.classList.add('toast', 'progress');

			const header = document.createElement('div');
			header.classList.add('toast-header');
			progressToast.appendChild(header);

			progressMain = document.createElement('span');
			header.appendChild(progressMain);

			progressCancelButton = document.createElement('button');
			progressCancelButton.classList.add('reset');
			progressCancelButton.onclick = () => progressCancel?.();
			mount(Icon, { target: progressCancelButton, props: { i: 'xmark-large' } });
			header.appendChild(progressCancelButton);

			progressMessage = document.createElement('span');
			progressMessage.classList.add('subtle');
			progressToast.appendChild(progressMessage);

			progressBar = document.createElement('progress');
			progressToast.appendChild(progressBar);

			list.appendChild(progressToast);
			addEventListener('beforeunload', warnBeforeUnload);
		}
		progressMain.textContent = message;
		progressMessage.textContent = '';
		progressCancelButton.style.display = progressCancel ? '' : 'none';
		progressBar.removeAttribute('value');
		progressBar.max = 1;
	},
	progress(value: number, max: number, message?: any): void {
		if (!progressToast) return;
		progressBar.value = value;
		progressBar.max = max;
		progressMessage.textContent = message == undefined ? '' : String(message);
	},
	done(): void {
		if (!progressToast) return;
		progressToast.remove();
		progressToast = undefined;
		progressCancel = undefined;
		removeEventListener('beforeunload', warnBeforeUnload);
	},
});

Object.assign(globalThis, { toast, toastStatus });
