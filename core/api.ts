import * as z from 'zod';

export const User = z.object({
	email: z.string().email(),
	name: z.string(),
	image: z.string().url(),
});
export type User = z.infer<typeof User>;
