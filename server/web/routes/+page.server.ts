import { authenticate } from '$lib/auth.js';
import type { PageServerLoadEvent } from './$types.js';

export async function load(event: PageServerLoadEvent) {
	const auth = (await authenticate(event)) ?? {};
	return { ...auth };
}
