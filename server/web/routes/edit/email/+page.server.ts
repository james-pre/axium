import { fail, redirect, type Actions } from '@sveltejs/kit';
import { adapter } from '../../../../src/auth';
import * as z from 'zod';
import type { PageServerLoadEvent } from './$types';

export async function load(event: PageServerLoadEvent) {
	const session = await event.locals.auth();
	if (!session) redirect(307, '/auth/signin');
	return { session };
}

export const actions = {
	async default(event) {
		const session = await event.locals.auth();

		const rawEmail = (await event.request.formData()).get('email');
		const { data: email, success, error } = z.string().email().safeParse(rawEmail);

		if (!success)
			return fail(400, {
				email,
				error: error.flatten().formErrors[0] || Object.values(error.flatten().fieldErrors).flat()[0],
			});

		const user = await adapter.getUserByEmail(session.user.email);
		if (!user) return fail(500, { email, error: 'User does not exist' });

		try {
			await adapter.updateUser({ id: user.id, email, image: user.image });
		} catch (error: any) {
			return fail(400, { email, error: typeof error === 'string' ? error : error.message });
		}
		redirect(303, '/');
	},
} satisfies Actions;
