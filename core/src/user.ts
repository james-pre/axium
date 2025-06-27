/**
 * User preferences.
 * Modify with `declare module ...`
 */

import z from 'zod/v4';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Preferences {}

export const User = z.object({
	id: z.string().uuid(),
	email: z.string().email(),
	name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
	image: z.string().url().nullable().optional(),
	email_verified: z.date().nullable().optional(),
});

export interface User extends z.infer<typeof User> {
	preferences?: Preferences;
}

export function getUserImage(user: { name?: string; image?: string }): string {
	if (user.image) return user.image;
	user.name ??= '\0';

	let color = user.name.charCodeAt(0);

	for (let i = 1; i < user.name.length; i++) {
		color *= user.name.charCodeAt(i);
	}

	color &= 0xbfbfbf;

	const r = (color >> 16) & 0xff;
	const g = (color >> 8) & 0xff;
	const b = color & 0xff;

	return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" style="background-color:rgb(${r},${g},${b});display:flex;align-items:center;justify-content:center;">
		<text x="23" y="28" style="font-family:sans-serif;font-weight:bold;" fill="white">${user.name.replaceAll(/\W/g, '')[0]}</text>
	</svg>`.replaceAll(/[\t\n]/g, '');
}
