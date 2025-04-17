import type { Actions } from '@sveltejs/kit';
import { adapter } from '../../dist/auth.js';
import { editEmail, editName } from '../actions.js';
import { loadSession } from '../utils.js';
import type { PageServerLoadEvent } from './$types.js';

export async function load(event: PageServerLoadEvent) {
	const { session } = await loadSession(event);
	const user = await adapter.getUserByEmail(session.user.email);
	return { session, user };
}

export const actions = {
	email: editEmail,
	name: editName,
} satisfies Actions;
