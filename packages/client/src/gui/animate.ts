/**
 * Returns whether an element currently has an animation.
 * This will be empty or `none` when prefers-reduced-motion is enabled
 */
export function hasAnimation(element: HTMLElement) {
	const { animationName } = getComputedStyle(element);
	return !!animationName && animationName !== 'none';
}

const pending = new WeakMap<HTMLElement, Promise<void>>();

export function onAnimationEnd(element: HTMLElement): Promise<void> {
	if (!hasAnimation(element)) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	element.addEventListener('animationend', () => resolve(), { once: true });
	element.addEventListener('animationcancel', () => resolve(), { once: true });
	return promise;
}

/** Waits for an animation to complete on an element, after any other animations. */
export async function animate(element: HTMLElement, animation: string): Promise<void> {
	await pending.get(element);
	element.style.animation = animation;
	const ended = onAnimationEnd(element);
	pending.set(element, ended);
	await ended;
	if (pending.get(element) === ended) pending.delete(element);
}
