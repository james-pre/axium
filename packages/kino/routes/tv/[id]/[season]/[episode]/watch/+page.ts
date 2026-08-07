import { getAdjacentEpisodes, getEpisode, getTv } from '@axium/kino/client';
import { error } from '@sveltejs/kit';

export const ssr = false;

export async function load({ params, url }) {
	const id = Number(params.id),
		season = Number(params.season),
		episodeNumber = Number(params.episode);

	const [show, episode] = await Promise.all([getTv(id), getEpisode(id, season, episodeNumber)]);

	if (!episode.upload) error(404, 'This episode has not been uploaded');

	const adjacent = await getAdjacentEpisodes(show, season, episodeNumber);

	return { show, season, episode, upload: episode.upload, autoplay: url.searchParams.has('play'), ...adjacent };
}
