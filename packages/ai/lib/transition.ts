import { tick } from 'svelte';

/** Whether the browser supports view transitions and the user hasn't asked for reduced motion */
export function canTransition(): boolean {
	return !!document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Applies `update` in a view transition, so elements with a `view-transition-name` animate to their new place.
 * Skipped when the user prefers reduced motion.
 */
export async function viewTransition(update: () => unknown): Promise<void> {
	if (!canTransition()) {
		await update();
		return;
	}

	const transition = document.startViewTransition(async () => {
		await update();
		await tick();
	});

	await transition.updateCallbackDone;
}
