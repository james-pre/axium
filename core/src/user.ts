import * as z from 'zod';

/**
 * User preferences.
 * Modify with `declare module ...`
 */
export interface Preferences {}

export const User = z.object({
	id: z.uuid(),
	name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
	email: z.email(),
	emailVerified: z.date().nullish(),
	image: z.url().nullish(),
	preferences: z.record(z.string(), z.any()),
	roles: z.array(z.string()),
	registeredAt: z.date(),
});

export interface User extends z.infer<typeof User> {
	preferences: Preferences;
}

export const userPublicFields = ['id', 'image', 'name', 'registeredAt', 'roles'] as const satisfies (keyof User)[];

type UserPublicField = (typeof userPublicFields)[number];
export interface UserPublic extends Pick<User, UserPublicField> {}

export const userProtectedFields = ['email', 'emailVerified', 'preferences'] as const satisfies (keyof User)[];

export const UserChangeable = User.pick({
	name: true,
	email: true,
	image: true,
	preferences: true,
}).partial();

export type UserChangeable = z.infer<typeof UserChangeable>;

export function getUserImage(user: Partial<User>): string {
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
