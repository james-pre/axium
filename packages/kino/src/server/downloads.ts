import { getConfig } from '@axium/core';
import { database, type Schema } from '@axium/server/database';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium/node';
import * as kt from 'kinotool';
import type { Selectable } from 'kysely';
import { rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pick } from 'utilium';
import type { KinoDownload, KinoDownloadChoice, KinoDownloadInit, KinoDownloadState, KinoDownloadTarget, MediaExt } from '../common.js';
import { mediaExtensions, mediaTypes, targetsOverlap } from '../common.js';
import { getEpisode, getMovie, getSeason } from './db.js';
import { applyMetadata, episodePath, moviePath, remuxUpload } from './media.js';

type DownloadRow = Selectable<Schema['kino_downloads']>;

function targetOf(row: DownloadRow): KinoDownloadTarget {
	switch (row.type) {
		case 'movie':
			return { type: 'movie', id: row.id };
		case 'season':
			return { type: 'season', id: row.id, season: row.season_number! };
		default:
			return { type: 'episode', id: row.id, season: row.season_number!, episode: row.episode_number! };
	}
}

function targetColumns(target: KinoDownloadTarget): Pick<DownloadRow, 'type' | 'id' | 'season_number' | 'episode_number'> {
	return {
		type: target.type,
		id: target.id,
		season_number: target.type == 'movie' ? null : target.season,
		episode_number: target.type == 'episode' ? target.episode : null,
	};
}

/** Where a download is written before it is moved into the library. Only one download can exist per target. */
function stagingDirectory(target: KinoDownloadTarget): string {
	const name = [target.type == 'movie' ? 'movie' : 'tv', target.id];
	if (target.type != 'movie') name.push(target.season);
	if (target.type == 'episode') name.push(target.episode);
	return join(getConfig('@axium/kino').upload.temp_dir, 'kino-downloads', name.join('-'));
}

function extensionOf(file: kt.torrent.File): MediaExt {
	const ext = extname(file.path).toLowerCase() as MediaExt;
	if (!mediaExtensions.includes(ext)) throw new Error(`${file.path} is not a supported media file`);
	return ext;
}

/** The episode each file is, in the same order as `files` */
function matchEpisodes(files: kt.torrent.File[], episodes: kt.Episode[]): kt.Episode[] {
	if (files.length != episodes.length)
		throw new Error(`The torrent has ${files.length} media files, but the season has ${episodes.length} episodes`);

	const numbers = files.map(file => kt.resolveNameInfo(file.path).episode);
	const byNumber = new Map(episodes.map(episode => [episode.episode_number, episode]));

	if (new Set(numbers).size == files.length && numbers.every(number => number !== undefined && byNumber.has(number))) {
		return numbers.map(number => byNumber.get(number!)!);
	}

	// File names without an episode number are still usually in episode order
	const sortedFiles = files.toSorted((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
	const sortedEpisodes = episodes.toSorted((a, b) => a.episode_number - b.episode_number);
	return files.map(file => sortedEpisodes[sortedFiles.indexOf(file)]);
}

interface Placement {
	file: kt.torrent.File;
	/** Library path, without an extension */
	base: string;
	ext: MediaExt;
	data: kt.Movie | kt.Episode;
}

let client: kt.torrent.Client | undefined;

const active = new Map<string, LibraryDownload>();

class LibraryDownload {
	download?: kt.torrent.Download;

	protected status?: kt.torrent.Status;

	/** Download rate smoothed over recent updates, in bytes per second */
	protected rate?: number;

	protected importing: boolean = false;

	/** Media files the user can pick from, when there is more than one */
	protected choices: KinoDownloadChoice[] | null = null;
	protected chosen?: (indices: number[]) => void;

	constructor(readonly row: DownloadRow) {}

	get target(): KinoDownloadTarget {
		return targetOf(this.row);
	}

	get state(): KinoDownloadState {
		if (this.row.error) return 'failed';
		if (this.importing) return 'importing';
		if (this.row.seeding) return 'seeding';
		if (this.choices) return 'selecting';
		if (!this.download?.isSelected) return 'metadata';

		switch (this.status?.state) {
			case 'checking_files':
			case 'checking_resume_data':
				return 'checking';
			case 'downloading_metadata':
				return 'metadata';
			default:
				return 'downloading';
		}
	}

	toJSON(): KinoDownload {
		const { status, state } = this;

		return {
			hash: this.row.hash,
			userId: this.row.userId,
			target: this.target,
			name: status?.name || null,
			state,
			progress: status?.progress ?? 0,
			size: status?.wanted ?? 0,
			downloaded: status?.done ?? 0,
			downloadRate: status?.downloadRate ?? 0,
			uploadRate: status?.uploadRate ?? 0,
			remaining: state == 'downloading' && status && this.rate ? (status.wanted - status.done) / this.rate : null,
			peers: status?.peers ?? 0,
			error: this.row.error,
			choices: this.choices,
			createdAt: this.row.createdAt,
		};
	}

	emit(): void {
		socketServer?.to('web').emit('kino.download.update', this.toJSON());
	}

	async start(client: kt.torrent.Client): Promise<void> {
		const { row } = this;

		const download = await client.add({
			source: row.magnet,
			resume: row.resume ?? undefined,
			directory: stagingDirectory(this.target),
			extensions: mediaExtensions,
			// Seasons need every file, so there is nothing to pick
			select: row.type == 'season' ? undefined : files => this.ask(files),
		});

		if (row.hash && download.id != row.hash) io.warn(`Kino: download ${row.hash} was resumed as ${download.id}`);
		row.hash = download.id;
		this.download = download;

		download.on('status', status => {
			this.status = status;
			this.rate = this.rate === undefined ? status.downloadRate : this.rate * 0.8 + status.downloadRate * 0.2;
			this.emit();
		});

		// Catch a season that doesn't match before anything is downloaded
		download.on('selected', files => {
			if (row.type == 'season') this.placements(files).catch(error => this.fail(error));
			this.emit();
		});

		download.on('finished', files => void this.import(files));
		download.on('failed', error => void this.fail(error));

		download.on('resume_data', resume => {
			database
				.updateTable('kino_downloads')
				.set({ resume })
				.where('hash', '=', row.hash)
				.execute()
				.catch(error => io.warn(`Kino: could not save resume data for ${row.hash}:`, io.errorText(error)));
		});
	}

	protected ask(files: kt.torrent.File[]): Promise<number[]> {
		this.choices = files.map(({ index, path, size }) => ({ index, path, size }));
		const { promise, resolve } = Promise.withResolvers<number[]>();
		this.chosen = resolve;
		this.emit();
		return promise;
	}

	/** @returns whether `index` was one of the choices */
	choose(index: number): boolean {
		if (!this.chosen || !this.choices?.some(choice => choice.index == index)) return false;

		this.chosen([index]);
		this.chosen = undefined;
		this.choices = null;
		this.emit();
		return true;
	}

	protected async placements(files: kt.torrent.File[]): Promise<Placement[]> {
		const { target } = this;

		if (target.type == 'season') {
			const { episodes = [] } = await getSeason(target.id, target.season);
			const matched = matchEpisodes(files, episodes);

			return files.map((file, i) => ({
				file,
				base: episodePath(target.id, target.season, matched[i].episode_number),
				ext: extensionOf(file),
				data: matched[i],
			}));
		}

		if (files.length != 1) throw new Error(`Expected one media file, but ${files.length} were downloaded`);
		const [file] = files;

		return target.type == 'movie'
			? [{ file, base: moviePath(target.id), ext: extensionOf(file), data: await getMovie(target.id) }]
			: [
					{
						file,
						base: episodePath(target.id, target.season, target.episode),
						ext: extensionOf(file),
						data: await getEpisode(target.id, target.season, target.episode),
					},
				];
	}

	/** Move finished files into the library */
	protected async import(files: kt.torrent.File[]): Promise<void> {
		// Resumed torrents can finish again
		if (this.importing || this.row.seeding || this.row.error || !this.download) return;

		const { download } = this;

		this.importing = true;
		this.emit();

		try {
			const placements = await this.placements(files);
			const { seed } = getConfig('@axium/kino').torrent;

			await database.transaction().execute(async tx => {
				for (const { file, ext, data } of placements) {
					const upload = { name: basename(file.path), size: BigInt(file.size), type: mediaTypes[ext], hash: null };

					if ('title' in data)
						await tx
							.insertInto('kino_movie_uploads')
							.values({ ...upload, id: data.id })
							.execute();
					else
						await tx
							.insertInto('kino_tv_uploads')
							.values({ ...upload, ...pick(data, 'id', 'season_number', 'episode_number') })
							.execute();
				}

				await download.move(new Map(placements.map(({ file, base, ext }) => [file.index, base + ext])));
			});

			io.info('Kino: downloaded', placements.map(({ base, ext }) => base + ext).join(', '));

			if (seed) {
				this.row.seeding = true;
				await database.updateTable('kino_downloads').set({ seeding: true }).where('hash', '=', this.row.hash).execute();
			} else {
				await download.remove();
				await this.forget();
			}

			for (const { base, ext, data } of placements) {
				// Seeding needs the file to stay exactly as it was downloaded
				if (seed) io.info('Kino: not writing metadata to', base + ext, 'since it is being seeded');
				else await applyMetadata(base + ext, ext, data);

				void remuxUpload(base);
			}
		} catch (error) {
			await this.fail(error);
		} finally {
			this.importing = false;
			if (active.has(this.row.hash)) this.emit();
		}
	}

	/**
	 * Files are never deleted through libtorrent: once moved, the torrent's files are the library's.
	 * Only the staging directory is removed.
	 */
	protected async stop(): Promise<void> {
		// Picking nothing makes kinotool remove the torrent itself
		this.chosen?.([]);
		this.chosen = undefined;
		this.choices = null;

		await this.download?.remove().catch(() => {});
		this.download = undefined;

		// Seeding still needs the parts of files shared with ones that weren't downloaded
		if (!this.row.seeding) rmSync(stagingDirectory(this.target), { recursive: true, force: true });
	}

	async fail(error: unknown): Promise<void> {
		if (this.row.error) return;

		const message = io.errorText(error);
		io.warn(`Kino: download ${this.row.hash} failed:`, message);
		this.row.error = message;

		await this.stop();

		await database
			.updateTable('kino_downloads')
			.set({ error: message })
			.where('hash', '=', this.row.hash)
			.execute()
			.catch(error => io.warn('Kino: could not record download failure:', io.errorText(error)));

		this.emit();
	}

	protected async forget(): Promise<void> {
		active.delete(this.row.hash);
		await database.deleteFrom('kino_downloads').where('hash', '=', this.row.hash).execute();
		rmSync(stagingDirectory(this.target), { recursive: true, force: true });
		socketServer?.to('web').emit('kino.download.remove', this.row.hash);
	}

	/** Cancel the download, stop seeding it, or dismiss its failure */
	async cancel(): Promise<void> {
		await this.stop();
		await this.forget();
	}
}

/** Pick up downloads from before the server started */
export async function load(): Promise<void> {
	if (!getConfig('@axium/kino').torrent.enabled) return;

	const torrents = new kt.torrent.Client();
	client = torrents;

	torrents.on('warning', message => io.debug('Kino: torrent:', message));

	torrents.on('exit', (code, signal) => {
		io.warn(`Kino: the torrent process exited (${signal ?? code}), restarting it`);
		client = undefined;
		active.clear();
		setTimeout(() => void load().catch(error => io.error('Kino: could not restart downloads:', io.errorText(error))), 5000).unref();
	});

	for (const row of await database.selectFrom('kino_downloads').selectAll().execute()) {
		const job = new LibraryDownload(row);
		active.set(row.hash, job);
		if (!row.error) await job.start(torrents).catch(error => job.fail(error));
	}
}

/** Saved periodically, so a crash only loses recent progress */
setInterval(() => {
	for (const job of active.values()) {
		if (job.download?.isSelected && !job.row.seeding) job.download.saveResumeData().catch(() => {});
	}
}, 5 * 60_000).unref();

export function enabled(): boolean {
	return !!client;
}

export function list(): KinoDownload[] {
	return active
		.values()
		.map(job => job.toJSON())
		.toArray();
}

export function get(hash: string): LibraryDownload | undefined {
	return active.get(hash);
}

/** A download that would write some of the same files as `target` */
export function find(target: KinoDownloadTarget): LibraryDownload | undefined {
	return active.values().find(job => targetsOverlap(job.target, target));
}

export async function start(userId: string, init: KinoDownloadInit): Promise<KinoDownload> {
	if (!client) throw new Error('Downloads are not enabled');

	const job = new LibraryDownload({
		hash: '',
		userId,
		magnet: init.magnet,
		...targetColumns(init.target),
		resume: null,
		seeding: false,
		error: null,
		createdAt: new Date(),
	});

	await job.start(client);
	active.set(job.row.hash, job);

	try {
		await database.insertInto('kino_downloads').values(job.row).execute();
	} catch (error) {
		await job.cancel().catch(() => {});
		throw error;
	}

	io.info(`Kino: downloading ${job.row.hash} for ${init.target.type} ${init.target.id}`);
	job.emit();
	return job.toJSON();
}

/** Stop downloads and seeding for media that is being removed */
export async function stop(target: KinoDownloadTarget): Promise<void> {
	for (const job of active.values()) {
		if (targetsOverlap(job.target, target)) await job.cancel();
	}
}
