import { Name } from '@axium/core/schemas';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { adapter } from '../../../dist/auth.js';
import { web } from '../../../dist/config.js';
import type { PageServerLoadEvent } from './$types.js';

export async function load(event: PageServerLoadEvent) {
	const session = await event.locals.auth();
	if (!session) redirect(307, '/auth/signin');
	return { session };
}

export const actions = {
	async default(event) {
		const session = await event.locals.auth();

		const rawName = (await event.request.formData()).get('name');
		const { data: name, success, error } = Name.safeParse(rawName);

		if (!success)
			return fail(400, {
				name,
				error: error.flatten().formErrors[0] || Object.values(error.flatten().fieldErrors).flat()[0],
			});

		const user = await adapter.getUserByEmail(session.user.email);
		if (!user) return fail(500, { name, error: 'User does not exist' });

		try {
			await adapter.updateUser({ id: user.id, name, image: user.image });
		} catch (error: any) {
			return fail(400, { name, error: typeof error === 'string' ? error : error.message });
		}
		redirect(303, web.prefix);
	},
} satisfies Actions;
