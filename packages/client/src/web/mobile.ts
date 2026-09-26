const width = matchMedia('(width <= 700px)');

export function isMobile(): boolean {
	return width.matches;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function vibrate(duration: number = 10): void {
	if (reducedMotion.matches) return;
	navigator.vibrate?.(duration);
}
