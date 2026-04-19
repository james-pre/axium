import { getCurrentSession } from '@axium/client/user';
import type { PageLoadEvent } from './$types';
import type { SessionAndUser } from '@axium/server/auth';
import { fetchAPI } from '@axium/client/requests';
import { errorText } from 'ioium';

export const ssr = false;

const nativeAppPattern = /^[\w-]+$/;

export async function load({ parent, url }: Omit<PageLoadEvent, 'parent'> & { parent?(): Promise<{ session: SessionAndUser }> }) {
	const { session = await getCurrentSession() } = (await parent?.()) ?? {};

	if (!session) location.href = '/login?after=/login/client' + location.search;

	let nativeApp = url.searchParams.get('native');
	if (nativeApp && !nativeAppPattern.test(nativeApp)) nativeApp = null;
	const localCallback = new URL(nativeApp ? `${nativeApp}://login` : 'http://localhost');

	const client = url.searchParams.get('client') ?? '';

	let options,
		error: string | null = null;

	if (url.searchParams.has('port')) {
		try {
			const port = parseInt(url.searchParams.get('port') ?? '!');
			if (Number.isNaN(port)) throw new Error('Invalid port number provided by local client');
			localCallback.port = port.toString();
		} catch (e) {
			error = errorText(e);
		}
	}

	try {
		options = await fetchAPI('PUT', 'users/:id/auth', { type: 'client_login', client }, session.userId);
	} catch (e) {
		error = errorText(e);
	}

	return { options, error, session, localCallback };
}
