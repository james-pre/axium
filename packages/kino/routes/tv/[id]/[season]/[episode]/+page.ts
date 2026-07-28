import { getEpisode, getTv } from '@axium/kino/client';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id),
		season = Number(params.season);

	const [show, episode] = await Promise.all([getTv(id), getEpisode(id, season, Number(params.episode))]);

	return { show, season, episode };
}
