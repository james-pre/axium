<script lang="ts">
	import { drag } from '@axium/client/attachments';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Shown next to the cursor while files are dragged over */
		label: string;
		/** Drops are ignored when false, e.g. for media that has already been uploaded */
		enabled?: boolean;
		onDrop(entries: FileSystemEntry[]): unknown;
		children: Snippet;
	}

	const { label, enabled = true, onDrop, children }: Props = $props();
</script>

<div class="DropZone" {@attach enabled && drag.uploadTarget(label, onDrop)}>
	{@render children()}
</div>

<style>
	.DropZone {
		min-height: 100%;

		:global(&.drag-over) {
			outline: var(--border-accent);
			outline-offset: 0.5em;
			border-radius: 1em;
			background-color: hsl(from var(--bg-elevated) h s l / 0.5);
		}
	}
</style>
