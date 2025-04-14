import { Registration } from '@axium/core/schemas';
import { fail, redirect } from '@sveltejs/kit';
import * as auth from '../../../dist/auth.js';
import * as config from '../../../dist/config.js';
import type { Actions } from './$types.js';

export function load() {
	if (!config.auth.credentials) return redirect(307, '/auth/signin');
}

export const actions = {
	async default(event) {
		const { data, success, error } = Registration.safeParse(Object.fromEntries(await event.request.formData()));

		if (!success)
			return fail(400, {
				...data,
				error: error.flatten().formErrors[0] || Object.values(error.flatten().fieldErrors).flat()[0],
			});

		try {
			const { session } = await auth.register(data);
			event.cookies.set('session', session.sessionToken, {
				path: '/',
				expires: session.expires,
				httpOnly: true,
			});
			return { ...data, success: true, data: session.sessionToken };
		} catch (error: any) {
			return fail(400, { ...data, error: typeof error === 'string' ? error : error.message });
		}
	},
} satisfies Actions;
