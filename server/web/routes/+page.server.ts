import { getUser } from '../../src/auth.js';
import { loadSession } from '../utils.js';
import type { PageServerLoadEvent } from './$types.js';

export async function load(event: PageServerLoadEvent) {
	const { session } = await loadSession(event);
	const user = await getUser(session.userId);
	return { session, user };
}
