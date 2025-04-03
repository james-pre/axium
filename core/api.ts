import * as z from 'zod';

export const User = z.object({
	email: z.string().email(),
	name: z.string(),
	image: z.string().url(),
});
export type User = z.infer<typeof User>;

export const Login = z.object({
	email: z.string({ required_error: 'Email is required' }).min(1, 'Email is required').max(255, 'Email is too long').email('Invalid email'),
	password: z
		.string({ required_error: 'Password is required' })
		.min(1, 'Password is required')
		.min(8, 'Password must be more than 8 characters')
		.max(255, 'Password must be less than 255 characters'),
});
export type Login = z.infer<typeof Login>;

export const Registration = Login.extend({
	name: z.string({ required_error: 'Name is required' }),
});
export type Registration = z.infer<typeof Registration>;
