import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load({ parent }) {
	let { session } = await parent();

	if (!session) redirect(307, '/login?after=/contacts/new');

	return { session };
}
