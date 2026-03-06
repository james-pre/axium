/**
 * Returns whether an element currently has an animation.
 * This will be empty or `none` when prefers-reduced-motion is enabled
 */
export function hasAnimation(element: HTMLElement) {
	const { animationName } = getComputedStyle(element);
	return !!animationName && animationName !== 'none';
}

export function onAnimationEnd(element: HTMLElement): Promise<void> {
	if (!hasAnimation(element)) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	element.addEventListener('animationend', () => resolve(), { once: true });
	element.addEventListener('animationcancel', () => resolve(), { once: true });
	return promise;
}

/** Waits for an animation to complete on an element, after any other animations. */
export async function animate(element: HTMLElement, animation: string): Promise<void> {
	await onAnimationEnd(element);
	element.style.animation = animation;
	await onAnimationEnd(element);
}
