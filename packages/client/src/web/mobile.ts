const width = matchMedia('(width <= 700px)');

export function isMobile(): boolean {
	return width.matches;
}
