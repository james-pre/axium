import { text } from '@axium/client';
import { setProgressCancel, toast } from '@axium/client/toast';
import * as io from 'ioium';
import type { KinoUpload } from '../common.js';
import { uploadEpisode, uploadMovie } from './api.js';

/**
 * Report the outcome of an upload as a toast, reporting cancellation as info rather than an error.
 * Returns the upload when it succeeded so callers can update their state.
 */
async function toastUpload(upload: (signal: AbortSignal) => Promise<KinoUpload>, name: string): Promise<KinoUpload | undefined> {
	const controller = new AbortController();

	setProgressCancel(() => controller.abort());
	io.start(text('kino.uploading', { name }));

	try {
		const result = await upload(controller.signal);
		await toast('success', text('kino.upload_success'));
		return result;
	} catch (e) {
		if (e instanceof DOMException && e.name == 'AbortError') await toast('info', text('kino.upload_cancelled'));
		else await toast('error', e);
	} finally {
		io.done(true);
	}
}

export function uploadMovieFile(file: File, id: number): Promise<KinoUpload | undefined> {
	return toastUpload(
		signal => uploadMovie(file, id, { signal, onProgress: (uploaded, total) => io.progress(uploaded, total) }),
		file.name
	);
}

export function uploadEpisodeFile(file: File, id: number, season: number, episode: number): Promise<KinoUpload | undefined> {
	return toastUpload(
		signal => uploadEpisode(file, id, season, episode, { signal, onProgress: (uploaded, total) => io.progress(uploaded, total) }),
		file.name
	);
}
