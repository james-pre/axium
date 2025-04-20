import * as z from 'zod';

export const User = z.object({
	id: z.string().uuid(),
	email: z.string().email(),
	name: z.string().min(1, 'Name is required').max(255, 'Name is too long').nullable(),
	image: z.string().url().nullable(),
});
export type User = z.infer<typeof User>;

export const Login = z.object({
	email: z.string({ required_error: 'Email is required' }).min(1, 'Email is required').max(255, 'Email is too long').email('Invalid email'),
	password: z.string().max(255, 'Password must be less than 255 characters').optional(),
});
export type Login = z.infer<typeof Login>;

export const Registration = Login.extend({
	name: z.string({ required_error: 'Name is required' }),
});
export type Registration = z.infer<typeof Registration>;
