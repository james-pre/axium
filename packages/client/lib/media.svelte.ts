import { parseBuffer, parseWebStream, selectCover } from 'music-metadata';
import type { IAudioMetadata, IPicture } from 'music-metadata';
import type { SvelteMediaTimeRange } from 'svelte/elements';

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

	click = () => {
		if (this.ended) {
			this.currentTime = 0;
			this.paused = false;
		} else {
			this.paused = !this.paused;
		}
	};

	keydown = (e: KeyboardEvent) => {
		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				this.currentTime = Math.max(0, this.currentTime - 10);
				break;
			case 'ArrowRight':
				e.preventDefault();
				this.currentTime = Math.min(this.duration, this.currentTime + 10);
				break;
			case 'ArrowUp':
				this.volume = Math.min(1, this.volume + 0.1);
				break;
			case 'ArrowDown':
				this.volume = Math.max(0, this.volume - 0.1);
				break;
			case 'F11':
				e.preventDefault();
				this.element?.requestFullscreen();
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
		}
	};
}
