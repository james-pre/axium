import type { SessionInternal, UserInternal } from '@axium/server/auth.js';
import { getSessionAndUser } from '@axium/server/auth.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function authenticate(event: RequestEvent): Promise<(SessionInternal & { user: UserInternal | null }) | null> {
	const maybe_header = event.request.headers.get('Authorization');
	const token = maybe_header?.startsWith('Bearer ') ? maybe_header.slice(7) : event.cookies.get('session_token');

	if (!token) return null;

	return await getSessionAndUser(token).catch(() => null);
}
