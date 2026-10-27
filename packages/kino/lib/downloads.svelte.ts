import { addListener, connect, onConnect } from '@axium/client/socket';
import { getDownloads } from '@axium/kino/client';
import { targetsOverlap, type KinoDownload, type KinoDownloadTarget } from '@axium/kino/common';
import * as io from 'ioium';
import { SvelteMap } from 'svelte/reactivity';

/** Downloads by hash, kept up to date once {@link watchDownloads} is called */
export const downloads = new SvelteMap<string, KinoDownload>();

async function refresh(): Promise<void> {
	try {
		const list = await getDownloads();
		downloads.clear();
		for (const download of list) downloads.set(download.hash, download);
	} catch (e) {
		io.debug('Kino: could not load downloads: ' + io.errorText(e));
	}
}

async function watch(): Promise<void> {
	addListener('kino.download.update', download => downloads.set(download.hash, download));
	addListener('kino.download.remove', hash => downloads.delete(hash));

	await connect().catch(() => null);

	// Updates sent while disconnected are missed, so reload on reconnecting
	onConnect(() => void refresh());

	await refresh();
}

let watching: Promise<void> | undefined;

/** Load downloads and keep them up to date with the server. Safe to call more than once. */
export function watchDownloads(): Promise<void> {
	watching ??= watch();
	return watching;
}

/** The download that includes the movie or episodes of `target`, if there is one */
export function findDownload(target: KinoDownloadTarget): KinoDownload | undefined {
	return downloads.values().find(download => targetsOverlap(download.target, target));
}
