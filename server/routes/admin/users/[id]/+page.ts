import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ params }) {
	const user = await fetchAPI('GET', 'admin/users/:userId', null, params.id);

	for (const session of user.sessions) {
		session.created = new Date(session.created);
		session.expires = new Date(session.expires);
	}

	user.registeredAt = new Date(user.registeredAt);
	user.emailVerified = user.emailVerified ? new Date(user.emailVerified) : null;

	return { user };
}
