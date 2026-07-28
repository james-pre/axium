import { getSeason, getTv } from '@axium/kino/client';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id);

	const [show, season] = await Promise.all([getTv(id), getSeason(id, Number(params.season))]);

	return { show, season };
}
