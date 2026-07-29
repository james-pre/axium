import { getEpisode, getTv, getViews } from '@axium/kino/client';
import { error } from '@sveltejs/kit';

export const ssr = false;

export async function load({ params }) {
	const id = Number(params.id),
		season = Number(params.season),
		episodeNumber = Number(params.episode);

	const [show, episode] = await Promise.all([getTv(id), getEpisode(id, season, episodeNumber)]);

	if (!episode.upload) error(404, 'This episode has not been uploaded');

	// Used to resume where the last session left off; not worth failing the page over
	const views = await getViews().catch(() => []);
	const view = views.find(
		v => v.type == 'tv' && v.show.id == id && v.episode.season_number == season && v.episode.episode_number == episodeNumber
	);

	return { show, season, episode, upload: episode.upload, view };
}
