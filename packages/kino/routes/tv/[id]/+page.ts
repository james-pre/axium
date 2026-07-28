import { getTv } from '@axium/kino/client';

export const ssr = false;

export async function load({ params }) {
	return { show: await getTv(Number(params.id)) };
}
