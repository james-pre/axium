import { getCurrentSession } from '@axium/client/user';
import type { PageLoadEvent } from './$types';
import type { SessionAndUser } from '@axium/server/auth';
import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ parent, url }: Omit<PageLoadEvent, 'parent'> & { parent?(): Promise<{ session: SessionAndUser }> }) {
	const { session = await getCurrentSession() } = (await parent?.()) ?? {};

	if (!session) location.href = '/login?after=/login/client' + location.search;

	const port = parseInt(url.searchParams.get('port') ?? '!');
	const localCallback = new URL('http://localhost');

	const client = url.searchParams.get('client') ?? '';

	let options,
		error: string | null = null;
	try {
		if (Number.isNaN(port)) throw new Error('Invalid port number provided by local client');
		localCallback.port = port.toString();
		options = await fetchAPI('OPTIONS', 'users/:id/auth', { type: 'client_login', client }, session.userId);
	} catch (e: any) {
		error = e.message;
	}

	return { options, error, session, localCallback };
}
