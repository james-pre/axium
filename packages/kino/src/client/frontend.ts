import { text } from '@axium/client';
import { setProgressCancel, toast } from '@axium/client/toast';
import * as io from 'ioium';
import type { KinoUpload, MediaExt } from '../common.js';
import { mediaExtensions } from '../common.js';
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
		void toast('success', text('kino.upload_success'));
		return result;
	} catch (e) {
		if (e instanceof DOMException && e.name == 'AbortError') void toast('info', text('kino.upload_cancelled'));
		else void toast('error', e);
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

interface DroppedFile {
	file: File;
	/** The directories the file was found in, relative to the drop target */
	directories: string[];
}

/**
 * Recursively resolve dragged filesystem entries into files, remembering where each one came from.
 *
 * Dropped files have no `webkitRelativePath`, so the equivalent path is built while walking.
 */
async function collectDropped(entries: Iterable<FileSystemEntry>, directories: string[] = []): Promise<DroppedFile[]> {
	const files: DroppedFile[] = [];

	for (const entry of entries) {
		if (entry.isDirectory) {
			const reader = (entry as FileSystemDirectoryEntry).createReader();

			// `readEntries` returns a limited number of entries at a time and an empty batch when done
			const read = () => new Promise(reader.readEntries.bind(reader));
			for (let batch = await read(); batch.length; batch = await read())
				files.push(...(await collectDropped(batch, [...directories, entry.name])));
		} else {
			const file = await new Promise((entry as FileSystemFileEntry).file.bind(entry));
			files.push({ file, directories });
		}
	}

	return files;
}

/** Split a file name into its base name and lowercased extension */
function splitExtension(name: string): [base: string, extension: string] {
	const dot = name.lastIndexOf('.');
	return dot < 1 ? [name, ''] : [name.slice(0, dot), name.slice(dot).toLowerCase()];
}

/**
 * Anything that isn't a container we accept — subtitles, artwork, `.nfo` files — is dropped silently,
 * since whole season directories are usually full of them.
 */
function onlyMedia(files: DroppedFile[]): DroppedFile[] {
	return files.filter(({ file }) => mediaExtensions.includes(splitExtension(file.name)[1] as MediaExt));
}

/** How a season number can be introduced: `S01`, `Season 01` */
const seasonPrefix = 's(?:eason)?';

/** How an episode number can be introduced: `E07`, `Ep07`, `Episode 07` */
const episodePrefix = 'e(?:pisode|p)?';

/**
 * Anything that isn't a letter or a digit separates words, so `_`, `.`, `-` and spaces all count.
 * `\b` is not used here since it treats `_` as part of a word.
 */
const boundary = '[^a-z0-9]';

/** A number on its own, e.g. `07` */
function parseBare(part: string): number | null {
	return /^\d+$/.test(part.trim()) ? Number(part.trim()) : null;
}

/** A prefixed number anywhere in `part`, so long as it starts and ends on a word boundary, e.g. `E07` in `Show_E07_1080p` */
function parsePrefixed(part: string, prefix: string): number | null {
	const match = new RegExp(`(?:^|${boundary})${prefix}${boundary}*(\\d+)(?![a-z0-9])`, 'i').exec(part);
	return match ? Number(match[1]) : null;
}

/** The season or episode number a name gives, either as the whole name (`07`) or as a prefixed part of it (`E07`, `Ep 7`) */
function parseNumbered(part: string, prefix: string): number | null {
	return parseBare(part) ?? parsePrefixed(part, prefix);
}

interface EpisodeTarget {
	season: number;
	episode: number;
}

/** A file that couldn't be resolved to an episode, as the key of the message explaining why */
type Unresolved = string;

/** Both numbers at once, e.g. `S01E07`, `Duck.S1Ep1`, or `Example_S01E01` */
const codePattern = new RegExp(
	`(?:^|${boundary})${seasonPrefix}${boundary}*(\\d+)${boundary}*${episodePrefix}${boundary}*(\\d+)(?![a-z0-9])`,
	'i'
);

function parseCode(base: string): EpisodeTarget | null {
	const match = codePattern.exec(base);
	return match ? { season: Number(match[1]), episode: Number(match[2]) } : null;
}

/**
 * Which episode a file dropped on a show page is for.
 * Either the name contains an `S01E07` code, or it gives an episode number inside an `S01`/`01` directory.
 */
function showTarget({ file, directories }: DroppedFile): EpisodeTarget | Unresolved {
	const [base] = splitExtension(file.name);

	const code = parseCode(base);
	if (code) return code;

	const directory = directories.at(-1);
	if (!directory) return 'kino.invalid_show_files';

	const season = parseNumbered(directory, seasonPrefix);
	const episode = parseNumbered(base, episodePrefix);
	return season === null || episode === null ? 'kino.invalid_show_files' : { season, episode };
}

/** Which episode a file dropped on a season page is for. The season is already known, so only the number matters. */
function seasonTarget({ file }: DroppedFile, season: number): EpisodeTarget | Unresolved {
	const [base] = splitExtension(file.name);

	const code = parseCode(base);
	if (code) return code.season == season ? code : 'kino.wrong_season_files';

	const episode = parseNumbered(base, episodePrefix);
	return episode === null ? 'kino.invalid_season_files' : { season, episode };
}

interface PendingEpisode extends EpisodeTarget {
	file: File;
}

/**
 * Upload episodes one at a time, reporting the overall progress in bytes via `io.progress`.
 * The upload can be cancelled from the progress toast, which leaves already finished uploads in place.
 *
 * Returns how many were uploaded so callers know whether anything needs refreshing.
 */
async function uploadAll(id: number, uploads: PendingEpisode[]): Promise<number> {
	const totalBytes = uploads.reduce((total, { file }) => total + file.size, 0);
	let uploadedBytes = 0,
		count = 0;

	const controller = new AbortController();

	setProgressCancel(() => controller.abort());
	io.start(
		uploads.length == 1
			? text('kino.uploading', { name: uploads[0].file.name })
			: text('kino.uploading_many', { count: uploads.length })
	);

	try {
		for (const { file, season, episode } of uploads) {
			await uploadEpisode(file, id, season, episode, {
				signal: controller.signal,
				onProgress: uploaded => io.progress(uploadedBytes + uploaded, totalBytes, uploads.length > 1 ? file.name : undefined),
			});
			uploadedBytes += file.size;
			count++;
		}

		void toast('success', text('kino.upload_success'));
	} catch (e) {
		if (e instanceof DOMException && e.name == 'AbortError') void toast('info', text('kino.upload_cancelled'));
		else void toast('error', e);
	} finally {
		io.done(true);
	}

	return count;
}

/**
 * Resolve every dropped file to an episode, then upload them.
 * Nothing is uploaded when a file can't be resolved, so a typo doesn't leave a half-finished drop behind.
 */
async function uploadDropped(
	id: number,
	files: DroppedFile[],
	resolve: (file: DroppedFile) => EpisodeTarget | Unresolved
): Promise<number> {
	const media = onlyMedia(files);

	if (!media.length) {
		void toast('error', text('kino.no_media_files'));
		return 0;
	}

	const uploads: PendingEpisode[] = [];

	/** Names of the files that couldn't be resolved, grouped by the reason they couldn't be */
	const invalid = new Map<Unresolved, string[]>();

	for (const dropped of media) {
		const target = resolve(dropped);

		if (typeof target != 'string') {
			uploads.push({ file: dropped.file, ...target });
			continue;
		}

		const path = [...dropped.directories, dropped.file.name].join('/');
		invalid.set(target, [...(invalid.get(target) ?? []), path]);
	}

	if (invalid.size) {
		for (const [reason, names] of invalid) void toast('error', text(reason, { names: names.join(', ') }));
		return 0;
	}

	// Upload in episode order so the progress toast reads sensibly
	uploads.sort((a, b) => a.season - b.season || a.episode - b.episode);

	return await uploadAll(id, uploads);
}

/** Handle a drop on a show page: `S01E07.mkv`, or `E07.mkv`/`07.mkv` inside an `S01`/`01` directory. */
export async function uploadShowDrop(entries: Iterable<FileSystemEntry>, id: number): Promise<number> {
	return await uploadDropped(id, await collectDropped(entries), showTarget);
}

/** Handle a drop on a season page: `E07.mkv`, `07.mkv`, or `S01E07.mkv` for this season. */
export async function uploadSeasonDrop(entries: Iterable<FileSystemEntry>, id: number, season: number): Promise<number> {
	return await uploadDropped(id, await collectDropped(entries), file => seasonTarget(file, season));
}

/**
 * The single file dropped on a movie or episode page.
 * The name is irrelevant here since the target is already known.
 */
async function droppedFile(entries: Iterable<FileSystemEntry>): Promise<File | undefined> {
	const media = onlyMedia(await collectDropped(entries));

	if (!media.length) {
		void toast('error', text('kino.no_media_files'));
		return;
	}

	if (media.length > 1) {
		void toast('error', text('kino.one_file_only'));
		return;
	}

	return media[0].file;
}

export async function uploadMovieDrop(entries: Iterable<FileSystemEntry>, id: number): Promise<KinoUpload | undefined> {
	const file = await droppedFile(entries);
	return file && (await uploadMovieFile(file, id));
}

export async function uploadEpisodeDrop(
	entries: Iterable<FileSystemEntry>,
	id: number,
	season: number,
	episode: number
): Promise<KinoUpload | undefined> {
	const file = await droppedFile(entries);
	return file && (await uploadEpisodeFile(file, id, season, episode));
}
