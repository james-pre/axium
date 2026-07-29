import { getConfig } from '@axium/core';
import * as io from 'ioium/node';
import * as kt from 'kinotool';
import { spawn } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mediaExtensions, mediaTypes, type MediaExt } from '../common.js';

export { extensionForType, mediaExtensions, mediaTypes, type MediaExt } from '../common.js';

/** Path of a movie's files, without an extension */
export function moviePath(id: number): string {
	return join(getConfig('@axium/kino').data_dir, 'movie', id.toString());
}

/** Path of an episode's files, without an extension */
export function episodePath(id: number, season: number, episode: number): string {
	return join(getConfig('@axium/kino').data_dir, 'tv', id.toString(), season.toString(), episode.toString());
}

export interface ResolvedMedia {
	path: string;
	ext: MediaExt;
	type: string;
}

/**
 * Pick which of an item's files to serve.
 *
 * This deliberately ignores the `remux` config: it can be changed at any time, and files written under
 * an older setting still have to be served. Only what is actually on disk decides.
 *
 * Playback prefers the MP4, since browsers can seek it without reading the whole file.
 * Downloads prefer the original upload, which still has every audio track and subtitle.
 */
export function resolveMedia(base: string, download: boolean = false): ResolvedMedia | null {
	const order: MediaExt[] = download ? ['.mkv', '.mp4'] : ['.mp4', '.mkv'];

	for (const ext of order) {
		if (existsSync(base + ext)) return { path: base + ext, ext, type: mediaTypes[ext] };
	}

	return null;
}

/** Every file belonging to an item, including a partial remux left behind by a crash */
export function mediaFiles(base: string): string[] {
	return [...mediaExtensions.map(ext => base + ext), base + '.mp4.part'].filter(existsSync);
}

/** Remove all of an item's files. Returns the paths that were removed. */
export function removeMedia(base: string): string[] {
	const files = mediaFiles(base);
	for (const file of files) rmSync(file, { force: true });
	return files;
}

/** Bases with a remux already running, so a retry can't start a second ffmpeg on the same file */
const remuxing = new Set<string>();

/**
 * Start remuxing a freshly uploaded MKV to MP4, if the config asks for it.
 *
 * Remuxing multi-GB files takes minutes, so ffmpeg is spawned rather than run through
 * `kt.mkv.remuxToMp4`, whose synchronous `trackCommand` would block the event loop for the duration.
 * Until it finishes, `resolveMedia` keeps serving the MKV.
 */
export function remuxUpload(base: string): void {
	const { remux } = getConfig('@axium/kino');
	if (remux == 'original') return;

	const input = base + '.mkv',
		output = base + '.mp4';

	// Nothing to do for files that were uploaded as MP4 or have already been remuxed
	if (!existsSync(input) || existsSync(output)) return;

	if (remuxing.has(base)) return;

	let plan;
	try {
		plan = kt.mkv.planRemuxToMp4(input, output);
	} catch (e: any) {
		// e.g. HEVC video, which would need a real transcode
		io.warn(`Kino: cannot remux ${input}: ` + io.errorText(e));
		return;
	}

	remuxing.add(base);
	io.info(`Kino: remuxing ${input}`);

	const child = spawn('ffmpeg', plan.args, { stdio: 'ignore' });

	child.on('error', e => {
		remuxing.delete(base);
		rmSync(plan.temp, { force: true });
		io.warn(`Kino: could not run ffmpeg: ` + io.errorText(e));
	});

	child.on('exit', code => {
		remuxing.delete(base);

		if (code !== 0) {
			rmSync(plan.temp, { force: true });
			io.warn(`Kino: remux of ${input} failed with code ${code}`);
			return;
		}

		try {
			renameSync(plan.temp, output);
		} catch (e: any) {
			rmSync(plan.temp, { force: true });
			io.warn(`Kino: could not finish remux of ${input}: ` + io.errorText(e));
			return;
		}

		io.info(`Kino: remuxed ${input}`);

		/**
		 * Deleting the original is safe while it is being read: the inode survives until every
		 * open handle is closed, and new requests resolve to the MP4.
		 */
		if (getConfig('@axium/kino').remux == 'replace') rmSync(input, { force: true });
	});

	// Don't hold the process open for a remux
	child.unref();
}

/**
 * Apply TMDB metadata to a freshly written file.
 *
 * Only Matroska is handled: `mkvpropedit` edits the header in place, so it finishes in milliseconds
 * regardless of file size. `kt.mp4.setFromMovie` would rewrite the entire container, and it runs
 * synchronously, so calling it here would block the event loop for as long as the copy takes.
 *
 * A remuxed MP4 still picks up the title through the remux's `-map_metadata`.
 *
 * @todo Tag directly-uploaded MP4s once kinotool can plan the rewrite the way `planRemuxToMp4` does,
 * so ffmpeg can be spawned instead of run inline.
 */
export async function applyMetadata(path: string, ext: MediaExt, data: kt.Movie | kt.Episode): Promise<void> {
	if (ext != '.mkv') {
		io.debug('Kino: skipping metadata for ' + path + ' (only Matroska can be tagged in place)');
		return;
	}

	try {
		if ('title' in data) await kt.mkv.setFromMovie(path, data);
		else await kt.mkv.setFromEpisode(path, data);

		// Browsers take the first audio track, which is often something they can't decode
		kt.mkv.setAacDefaultAudio(path, kt.mkv.getInfo(path));
	} catch (e: any) {
		// A file we can't tag is still playable, so don't fail the upload over it
		io.warn('Kino: could not write metadata to ' + path + ': ' + io.errorText(e));
	}
}
