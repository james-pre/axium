export function colorHash(input: string): `rgb(${number}, ${number}, ${number})` {
	let color = input.charCodeAt(0);

	for (let i = 1; i < input.length; i++) {
		color *= input.charCodeAt(i);
	}

	color &= 0xbfbfbf;

	const r = (color >> 16) & 0xff;
	const g = (color >> 8) & 0xff;
	const b = color & 0xff;
	return `rgb(${r}, ${g}, ${b})`;
}
