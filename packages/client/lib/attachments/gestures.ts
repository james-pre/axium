import type { Attachment } from 'svelte/attachments';

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
