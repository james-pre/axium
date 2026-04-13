import { parseBuffer, parseWebStream, selectCover } from 'music-metadata';
import type { IAudioMetadata, IPicture } from 'music-metadata';
import type { SvelteMediaTimeRange } from 'svelte/elements';

export interface MediaProps {
	src: string;
	metadataSource?: ReadableStream<Uint8Array> | Uint8Array;
	size: number | bigint;
	type: string;
	name?: string;
}

export interface MediaMetadataResult {
	metadata: IAudioMetadata;
	picture: (IPicture & { data: Uint8Array<ArrayBuffer> }) | null;
	pictureURL?: string;
}

export async function getMetadata(props: MediaProps): Promise<MediaMetadataResult> {
	const metadataFileInfo = { size: Number(props.size), mimeType: props.type, url: props.src, path: props.name };

	const metadata = await (ArrayBuffer.isView(props.metadataSource)
		? parseBuffer(props.metadataSource, metadataFileInfo)
		: parseWebStream(props.metadataSource, metadataFileInfo));

	// `picture.data`'s `source` is actually an `ArrayBufferLike`, we need it to be the more specific `ArrayBuffer`
	const picture = selectCover(metadata.common.picture) satisfies IPicture | null as MediaMetadataResult['picture'];

	if (props.metadataSource && !ArrayBuffer.isView(props.metadataSource)) await props.metadataSource.cancel();

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
				e.preventDefault();
				this.volume = Math.min(1, this.volume + 0.1);
				break;
			case 'ArrowDown':
				e.preventDefault();
				this.volume = Math.max(0, this.volume - 0.1);
				break;
		}
	};
}
