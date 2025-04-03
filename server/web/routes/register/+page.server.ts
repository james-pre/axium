import { Registration } from '@axium/core/api';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import * as auth from '../../../src/auth.js';

export const actions = {
	async default(event) {
		const formData = await event.request.formData();
		const { data, success, error } = Registration.safeParse(Object.fromEntries(formData));

		if (!success)
			return fail(400, {
				error: error.flatten().formErrors[0] || Object.values(error.flatten().fieldErrors).flat()[0],
			});

		try {
			const { session } = await auth.register(data);
			event.cookies.set('session', session.sessionToken, {
				path: '/',
				expires: session.expires,
				httpOnly: true,
			});
			return { success: true, data: session.sessionToken };
		} catch (error: any) {
			return fail(400, { error: typeof error === 'string' ? error : error.message });
		}
	},
} satisfies Actions;
