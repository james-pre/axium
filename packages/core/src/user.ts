import { pick } from 'utilium';
import * as z from 'zod';
import { PasskeyRegistration } from './passkeys.js';
import { Preferences } from './preferences.js';

export const User = z.object({
	id: z.uuid(),
	name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
	email: z.email(),
	emailVerified: z.coerce.date().nullish(),
	preferences: z.lazy(() => Preferences),
	roles: z.string().array(),
	/** Tags are internal, roles are public */
	tags: z.string().array(),
	registeredAt: z.coerce.date(),
	isAdmin: z.boolean(),
	isSuspended: z.boolean(),
});

export interface User extends z.infer<typeof User> {
	preferences: Preferences;
}

export interface UserInternal extends User {}

export const userPublicFields = ['id', 'name', 'registeredAt', 'roles'] as const satisfies (keyof User)[];

type UserPublicField = (typeof userPublicFields)[number];

export const UserPublic = User.partial(
	Object.fromEntries(
		Object.keys(User.shape)
			.filter((key: any) => !userPublicFields.includes(key))
			.map(key => [key, true])
	) as { [K in Exclude<keyof User, UserPublicField>]: true }
);

export interface UserPublic extends z.infer<typeof UserPublic> {}

export const userProtectedFields = [
	'email',
	'emailVerified',
	'preferences',
	'isAdmin',
	'isSuspended',
	'tags',
] as const satisfies (keyof User)[];

export const UserChangeable = z
	.object({
		...pick(User.shape, 'name', 'email'),
		preferences: z.lazy(() => Preferences),
	})
	.partial();

export interface UserChangeable extends z.infer<typeof UserChangeable> {
	preferences?: Preferences;
}

export const UserAdminChange = z
	.object({
		...pick(User.shape, 'id', 'name', 'email', 'roles', 'tags', 'isSuspended'),
		preferences: z.lazy(() => Preferences),
	})
	.partial()
	.required({ id: true });

export interface UserAdminChange extends z.infer<typeof UserAdminChange> {
	preferences?: Preferences;
}

export const UserRegistrationInit = z.object({
	name: z.string().min(1).max(100).optional(),
	email: z.email().optional(),
});

export const UserRegistration = z.object({
	name: z.string().min(1).max(100),
	email: z.email(),
	userId: z.uuid(),
	response: PasskeyRegistration,
});

export const UserAuthOptions = z.object({
	type: z.literal(['login', 'action', 'client_login']),
	client: z.string().max(200).optional(),
});

export type UserAuthOptions = z.infer<typeof UserAuthOptions>;

export const LogoutSessions = z.object({
	id: z.array(z.uuid()).optional(),
	confirm_all: z.boolean().optional(),
});
