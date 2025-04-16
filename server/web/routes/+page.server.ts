import { adapter } from '../../dist/auth.js';
import { web } from '../../dist/config.js';
import { loadSession } from '../utils.js';
import type { PageServerLoadEvent } from './$types.js';

export async function load(event: PageServerLoadEvent) {
	const { session } = await loadSession(event);
	const user = await adapter.getUserByEmail(session.user.email);
	return { session, user, prefix: web.prefix };
}
