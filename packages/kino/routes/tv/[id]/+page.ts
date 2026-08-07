import { getTv, getViews } from '@axium/kino/client';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id);

	const [show, [view]] = await Promise.all([getTv(id), getViews({ type: 'tv', id, limit: 1 }).catch(() => [])]);

	return { show, view };
}
