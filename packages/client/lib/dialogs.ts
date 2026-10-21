import { mount, unmount } from 'svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

export interface ConfirmOptions {
	confirmText?: string;
	danger?: boolean;
}

/**
 * Show a modal dialog asking the user to confirm `message`, resolving to whether they did.
 */
export function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
	const { promise, resolve } = Promise.withResolvers<boolean>();
	const dialog = mount(ConfirmDialog, { target: document.body, props: { ...options, message, onclose: resolve } });
	return promise.finally(() => unmount(dialog));
}
