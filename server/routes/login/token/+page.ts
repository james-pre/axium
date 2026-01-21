import { fetchAPI } from '@axium/client/requests';

export const ssr = false;

export async function load({ url }: { url: URL }) {
	const token = url.searchParams.get('token');
	if (!token) return { error: 'No token provided' };

	const userId = url.searchParams.get('user');
	if (!userId) return { error: 'No user ID provided' };

	try {
		await fetchAPI('POST', 'users/:id/verify/login', { token }, userId);
		location.href = '/account#passkeys';
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}
