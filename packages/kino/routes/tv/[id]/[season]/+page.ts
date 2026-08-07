import { getSeason, getTv, getViews } from '@axium/kino/client';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id),
		seasonNumber = Number(params.season);

	const [show, season, [view]] = await Promise.all([
		getTv(id),
		getSeason(id, seasonNumber),
		getViews({ type: 'tv', id, season: seasonNumber, limit: 1 }).catch(() => []),
	]);

	return { show, season, view };
}
