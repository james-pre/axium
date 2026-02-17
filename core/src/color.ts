import { hexToHSL } from 'utilium/color.js';
import { hex } from 'zod';

export function colorHash(input: string): number {
	let color = input.charCodeAt(0);

	for (let i = 1; i < input.length; i++) {
		color *= input.charCodeAt(i);
	}

	color &= 0xbfbfbf;

	return color;
}

export function colorHashHex(input: string): string {
	return colorHash(input).toString(16).padStart(6, '0');
}

export function colorHashRGB(input: string): string {
	const color = colorHash(input);

	const r = (color >>> 16) & 0xff;
	const g = (color >>> 8) & 0xff;
	const b = color & 0xff;

	return `rgb(${r}, ${g}, ${b})`;
}

/**
 * color information for events and calendars
 */
export const Color = hex().length(8);

enum ColorFlags {
	Adaptive = 1 << 6,
}

/**
 * Convert style data to a CSS color
 */
export function decodeColor(color: string): string {
	const hex = color.slice(2);
	const flags = parseInt(color.slice(0, 2), 16);

	if (flags & ColorFlags.Adaptive) {
		const [h, s, l] = hexToHSL(hex);
		return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)} calc(var(--bg-light, ${Math.round(l * 100)}) + (var(--light-step, 7) * 2)))`;
	}

	return `#${hex}`;
}

export function encodeColor(hex: string, adaptive: boolean = false): string {
	if (hex[0] == '#') hex = hex.slice(1);
	const flags = adaptive ? ColorFlags.Adaptive : 0;
	return flags.toString(16).padStart(2, '0') + hex;
}
