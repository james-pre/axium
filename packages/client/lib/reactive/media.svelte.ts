import type { IAudioMetadata, IPicture } from 'music-metadata';
import { parseBuffer, parseWebStream, selectCover } from 'music-metadata';
import type { SvelteMediaTimeRange } from 'svelte/elements';
import { MediaQuery } from 'svelte/reactivity';

// Touch-primary devices have no hover, so the controls have to be tapped in and out of view
const coarsePointer = new MediaQuery('pointer: coarse', false);

type MetadataSource = ReadableStream<Uint8Array> | Uint8Array;

export interface MediaProps {
	src: string;
	metadataSource?: MetadataSource | Promise<MetadataSource>;
	size: number | bigint;
	type: string;
	name?: string;
}

export type MediaPicture = (IPicture & { data: Uint8Array<ArrayBuffer> }) | null;

export interface MediaMetadataResult {
	metadata: IAudioMetadata;
	picture: MediaPicture;
	pictureURL?: string;
}

export async function getMetadata(props: MediaProps): Promise<MediaMetadataResult | null> {
	const source = await props.metadataSource;

	if (!source) return null;

	const metadataFileInfo = { size: Number(props.size), mimeType: props.type, url: props.src, path: props.name };

	const metadata = await (ArrayBuffer.isView(source)
		? parseBuffer(source, metadataFileInfo)
		: parseWebStream(source, metadataFileInfo, { skipPostHeaders: true }));

	// `picture.data`'s `source` is actually an `ArrayBufferLike`, we need it to be the more specific `ArrayBuffer`
	const picture = selectCover(metadata.common.picture) satisfies IPicture | null as MediaMetadataResult['picture'];

	if (source && !ArrayBuffer.isView(source)) await source.cancel();

	return {
		metadata,
		picture,
		pictureURL: picture ? URL.createObjectURL(new Blob([picture.data], { type: picture.format })) : undefined,
	};
}

export class MediaState {
	currentTime = $state<number>(0);
	playbackRate = $state<number>();
	paused = $state<boolean>();
	volume = $state<number>(1);
	muted = $state<boolean>();
	duration = $state<number>(0);
	buffered = $state<SvelteMediaTimeRange[]>([]);
	seekable = $state<boolean>();
	seeking = $state<boolean>();
	ended = $state<boolean>();
	element = $state<HTMLMediaElement>();
	container = $state<HTMLElement>();
	fullscreen = $state<boolean>(false);
	/** Whether the controls are shown. Only has an effect while they overlay the media. */
	controlsVisible = $state<boolean>(true);

	#hideTimer?: ReturnType<typeof setTimeout>;

	constructor(
		public hideDelay: number = 5000,
		/** How far the arrow keys and double taps skip */
		public skipSeconds: number = 10
	) {}

	click = () => {
		if (this.ended) {
			this.currentTime = 0;
			this.paused = false;
		} else {
			this.paused = !this.paused;
		}
	};

	/** The duration, or 0 when it isn't known yet (NaN until metadata loads, Infinity for streams) */
	get knownDuration(): number {
		return Number.isFinite(this.duration) && this.duration > 0 ? this.duration : 0;
	}

	get playIcon(): string {
		return this.ended ? 'arrow-rotate-right' : this.paused ? 'play' : 'pause';
	}

	get fullscreenTarget(): HTMLElement | null {
		if (this.container) return this.container;
		return this.element instanceof HTMLVideoElement ? this.element : null;
	}

	/** Whether tapping the media toggles the controls rather than playback */
	get touch(): boolean {
		return coarsePointer.current;
	}

	showControls = () => {
		this.controlsVisible = true;
		clearTimeout(this.#hideTimer);
		if (this.paused || !this.fullscreen) return;
		this.#hideTimer = setTimeout(() => (this.controlsVisible = false), this.hideDelay);
	};

	hideControls = () => {
		clearTimeout(this.#hideTimer);
		this.controlsVisible = false;
	};

	toggleControls = () => {
		if (this.controlsVisible) this.hideControls();
		else this.showControls();
	};

	skip(by: number) {
		if (!this.knownDuration) return;
		this.seek(this.currentTime + by);
	}

	toggleFullscreen = () => {
		if (globalThis.document?.fullscreenElement) void globalThis.document.exitFullscreen();
		else void this.fullscreenTarget?.requestFullscreen();
	};

	/** Keeps `fullscreen` in sync, use with `<svelte:document onfullscreenchange={media.updateFullscreen} />` */
	updateFullscreen = () => {
		this.fullscreen = !!this.fullscreenTarget && globalThis.document?.fullscreenElement === this.fullscreenTarget;
	};

	keydown = (e: KeyboardEvent) => {
		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				this.skip(-this.skipSeconds);
				break;
			case 'ArrowRight':
				e.preventDefault();
				this.skip(this.skipSeconds);
				break;
			case 'ArrowUp':
				this.volume = Math.min(1, this.volume + 0.1);
				break;
			case 'ArrowDown':
				this.volume = Math.max(0, this.volume - 0.1);
				break;
			case 'F11':
			case 'f':
				e.preventDefault();
				this.toggleFullscreen();
				break;
			case ' ':
				this.click();
				break;
			case 'm':
				this.muted = !this.muted;
				break;
			case 'p':
				if (this.element && this.element instanceof HTMLVideoElement) {
					this.element.requestPictureInPicture?.();
				} else {
					console.warn('Not a video element, can not use Picture-in-Picture');
				}
				break;
			case 'c':
				if (this.fullscreen) this.toggleControls();
				break;
		}
	};

	/** Seek to a time, clamped to the media's duration when known */
	seek(time: number) {
		this.currentTime = this.knownDuration ? Math.min(this.knownDuration, Math.max(0, time)) : Math.max(0, time);
		this.updateAttached();
	}

	protected isAttached: boolean = false;

	protected updateAttached() {
		if (!this.isAttached) return;

		globalThis.navigator?.mediaSession?.setPositionState({
			duration: this.knownDuration,
			position: this.currentTime,
		});
	}

	attachToSession(next?: (backward: boolean) => void) {
		const session = globalThis.navigator?.mediaSession;

		if (!session) return;

		this.isAttached = true;

		this.updateAttached();

		session.setActionHandler('play', () => {
			if (this.ended) this.currentTime = 0;
			this.paused = false;
			this.updateAttached();
		});
		session.setActionHandler('pause', () => {
			this.paused = true;
		});
		session.setActionHandler('stop', () => {
			this.paused = true;
			this.currentTime = 0;
			this.updateAttached();
		});
		session.setActionHandler('seekbackward', details => {
			if (!this.knownDuration) return;
			this.seek(this.currentTime - (details.seekOffset ?? 10));
		});
		session.setActionHandler('seekforward', details => {
			if (!this.knownDuration) return;
			this.seek(this.currentTime + (details.seekOffset ?? 10));
		});
		session.setActionHandler('seekto', details => {
			if (details.seekTime === undefined || details.seekTime === null) return;
			if (details.fastSeek && this.element?.fastSeek) {
				this.element.fastSeek(details.seekTime);
				return;
			}
			this.seek(details.seekTime);
		});

		if (!next) return;

		session.setActionHandler('previoustrack', () => {
			// Restart the current track instead when we're already a few seconds in
			if (this.currentTime > 3) {
				this.currentTime = 0;
				return;
			}
			next(true);
		});
		session.setActionHandler('nexttrack', () => next(false));
	}
}
