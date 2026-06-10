export async function copy(type: string, ...parts: BlobPart[]) {
	const blob = new Blob(parts, { type });
	const item = new ClipboardItem({ [type]: blob });
	await navigator.clipboard.write([item]);
}
