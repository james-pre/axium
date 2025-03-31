import { Login } from '@axium/core/api';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { adapter } from '../../auth.js';

export const actions = {
	async default(event) {
		const { data, success, error } = Login.safeParse(await event.request.formData());

		if (!success) return fail(400, { error: error.flatten().fieldErrors });
	},
} satisfies Actions;
