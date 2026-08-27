export function hasActiveInput(): boolean {
	const active = document.activeElement;
	return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
}
