import type { MediaState } from '@axium/client/reactive';
import { recordView, recordViewClosing } from '@axium/kino/client';
import type { KinoViewInit, KinoViewTarget } from '@axium/kino/common';
import * as io from 'ioium';

export interface WatchTrackerOptions {
	/** Identifies the movie or episode, without the progress fields */
	target: KinoViewTarget;
	media: MediaState;
	/** Position to seek to once the media is ready, in seconds */
	resumeFrom?: number | null;
	/** How often to report while playing, in milliseconds */
	interval?: number;
}

/**
 * Resume playback where the viewer left off and report progress as they watch.
 *
 * Registers effects, so it has to be called while a component is initializing.
 */
export function trackWatch({ target, media, resumeFrom, interval = 15_000 }: WatchTrackerOptions): void {
	let lastSent = -1;

	function current(): KinoViewInit {
		// `duration` is NaN until metadata loads, and Infinity for streams of unknown length
		const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : undefined;

		return { ...target, position: media.currentTime || 0, duration } as KinoViewInit;
	}

	/** Skip writes from a player sitting on the same frame */
	function changed(init: KinoViewInit): boolean {
		if (Math.abs(init.position - lastSent) < 1) return false;
		lastSent = init.position;
		return true;
	}

	function send(): void {
		const init = current();
		if (!changed(init)) return;

		// A failed progress update should never interrupt playback
		recordView(init).catch(e => io.debug('Kino: could not record progress: ' + io.errorText(e)));
	}

	function sendClosing(): void {
		const init = current();
		if (changed(init)) recordViewClosing(init);
	}

	let resumed = false;

	$effect(() => {
		/**
		 * Seeking needs a loaded element and a known duration, so this waits for both.
		 * Positions near the end are ignored so finishing something doesn't strand the next play at the credits.
		 */
		if (resumed || !resumeFrom || !media.element || !media.duration) return;

		resumed = true;
		if (resumeFrom < media.duration - 10) media.currentTime = resumeFrom;
	});

	$effect(() => {
		// Record straight away so it shows as recently watched even if they leave immediately
		send();

		const timer = setInterval(() => {
			if (!media.paused) send();
		}, interval);

		/**
		 * A backgrounded tab can be killed without ever firing `pagehide` or `beforeunload`, so
		 * `visibilitychange` is the only reliable signal on mobile. `pagehide` covers desktop
		 * navigations and bfcache entry, where `visibilitychange` does not always fire first.
		 */
		function onHide() {
			if (document.visibilityState == 'hidden') sendClosing();
		}

		document.addEventListener('visibilitychange', onHide);
		addEventListener('pagehide', sendClosing);

		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onHide);
			removeEventListener('pagehide', sendClosing);

			// Client-side navigation away from the page: the document survives, so a normal request is fine
			send();
		};
	});
}
