<script lang="ts">
	import type { Stats } from '@zenfs/core';
	import { basename } from '@zenfs/core/vfs/path.js';

	let { path, stats }: { path: string; stats: Stats } = $props();

	const base = $derived(basename(path));

	let modified = $derived(
		stats.mtime.toLocaleString('en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			hour12: false,
		})
	);

	let size = $derived(
		stats.size.toLocaleString('en', {
			notation: 'compact',
			style: 'unit',
			unit: 'byte',
			unitDisplay: 'narrow',
		})
	);
</script>

<p class="name">{base}</p>
<p class="modified">{modified}</p>
<p class="size">{size}</p>

<style>
	:host {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	:host(:hover) {
		background-color: #334;
	}

	.name {
		flex: 5 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.modified {
		flex: 0 0 5em;
	}

	.size {
		flex: 1 0 5em;
	}
</style>
