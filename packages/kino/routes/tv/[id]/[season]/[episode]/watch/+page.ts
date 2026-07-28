import { getEpisode, getTv } from '@axium/kino/client';
import { error } from '@sveltejs/kit';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id),
		season = Number(params.season);

	const [show, episode] = await Promise.all([getTv(id), getEpisode(id, season, Number(params.episode))]);

	if (!episode.upload) error(404, 'This episode has not been uploaded');

	return { show, season, episode, upload: episode.upload };
}
