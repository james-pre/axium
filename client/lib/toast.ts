import { errorText } from '@axium/core/io';
import { text } from '@axium/client/locales';
import Icon from './Icon.svelte';
import { mount } from 'svelte';

/**
 * How many seconds to show toasts for.
 * @todo Consider using a GUI config somewhere, which maybe the user could change in the future?
 */
const toastDuration = 5;

const list = document.querySelector<HTMLDivElement>('#toasts')!;

const toastIcons = {
	success: 'check',
	warning: 'regular/triangle-exclamation',
	error: 'octagon-xmark',
	info: 'regular/circle-info',
};

/** Used to determine icon and styling */
export type ToastType = 'plain' | keyof typeof toastIcons;

export function toast(type: ToastType, message: any): Promise<void> {
	const toast = document.createElement('div');
	toast.classList.add('toast', 'icon-text', type);
	if (type != 'plain') mount(Icon, { target: toast, props: { i: toastIcons[type] } });

	const span = document.createElement('span');
	span.textContent = errorText(message);
	toast.appendChild(span);
	list.appendChild(toast);

	const { promise, resolve } = Promise.withResolvers<void>();

	setTimeout(() => {
		toast.remove();
		resolve();
	}, toastDuration * 1000);

	return promise;
}

export async function toastStatus(promise: Promise<unknown>, successMessage: string = text('generic.success')): Promise<void> {
	try {
		await promise;
		await toast('success', successMessage);
	} catch (err) {
		await toast('error', err);
	}
}

Object.assign(globalThis, { toast, toastStatus });
