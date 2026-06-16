<script lang="ts">
	/**
	 * A component for rendering a storage item's path nicely.
	 *
	 * Most of the complexity is for handling overflow with the path segments.
	 * The goal is to show the user the most relevant parts when we can't show them all.
	 *
	 *
	 * Take for example a path for the taxonomy of a Mallard:
	 * ~ / Eukaryota / Animalia / Chordata / Aves / Anseriformes / Anatidae / Anatinae / Anatini / Anas / Anas platyrhynchos (no overflow)
	 * ~ / Eukaryota / Animalia / Chordata / Aves / ... / Anatinae / Anatini / Anas / Anas platyrhynchos
	 * ~ / Eukaryota / Animalia / Chordata / ... / Anatini / Anas / Anas platyrhynchos
	 * ~ / Eukaryota / Animalia / ... / Anas / Anas platyrhynchos
	 * ~ / Eukaryota / ... / Anas / Anas platyrhynchos
	 * ~ / ... / Anas / Anas platyrhynchos
	 * ... / Anas / Anas platyrhynchos (we prioritize the immediate parent)
	 * ... / Anas platyrhynchos
	 * ... / Anas plat...
	 */

	import type { StorageItemMetadata } from '@axium/storage/common';
	import { drag } from '@axium/client/attachments';
	import { tick } from 'svelte';
	import { structurallyEqual } from 'utilium';

	const {
		item,
		hideRoot,
		/** When provided, each breadcrumb segment becomes a drop target that moves items into that folder (`null` for the root). */
		onDropMove,
	}: { item: StorageItemMetadata; hideRoot?: boolean; onDropMove?: (ids: string[], parentId: string | null) => unknown } = $props();

	let container = $state<HTMLSpanElement>(),
		measure = $state<HTMLSpanElement>();

	interface Part {
		id: string;
		name: string;
		href: string;
	}

	const parts = $derived<Part[]>([
		...(hideRoot ? [] : [{ id: 'root', name: '~', href: '/files' }]),
		...(item.parents?.map(({ id, name }) => ({ id, name, href: `/files/${id}` })) ?? []),
	]);

	let visibleParts = $state<Part[]>([]),
		ellipsisIndex = $state<number | null>(0),
		canTruncateName = $state(true),
		initialized = $state(false);

	function sum(values: number[]): number {
		return values.reduce((total, value) => total + value, 0);
	}

	interface Candidate {
		visible: Part[];
		ellipsisIndex: number | null;
		canTruncateName: boolean;
	}

	function applyCandidate(candidate: Candidate) {
		initialized = true;

		if (structurallyEqual({ canTruncateName, ellipsisIndex, visible: visibleParts } satisfies Candidate, candidate)) return;

		visibleParts = candidate.visible;
		ellipsisIndex = candidate.ellipsisIndex;
		canTruncateName = candidate.canTruncateName;
	}

	const fitEpsilon = 1;
	let updateId = 0;

	async function updateOverflow() {
		if (!container || !measure || !item.parents) return;

		const currentUpdateId = ++updateId;

		await tick();

		if (currentUpdateId !== updateId || !container || !measure) return;

		const partWidths = Array.from(measure.querySelectorAll<HTMLElement>('[data-part]')).map(
			element => element.getBoundingClientRect().width
		);

		if (partWidths.length !== parts.length) return;

		const available = Math.max(0, container.getBoundingClientRect().width - fitEpsilon);

		for (let hiddenCount = 0; hiddenCount <= parts.length; hiddenCount++) {
			const ellipsisWidth = measure.querySelector<HTMLElement>('[data-ellipsis]')?.getBoundingClientRect().width ?? 0,
				nameWidth = measure.querySelector<HTMLElement>('[data-name]')?.getBoundingClientRect().width ?? 0;

			if (hiddenCount <= 0) {
				if (available < sum(partWidths) + nameWidth) continue;
				applyCandidate({ visible: parts, ellipsisIndex: null, canTruncateName: false });
				return;
			}

			const keepCount = parts.length - hiddenCount;

			if (keepCount <= 0) {
				if (available < ellipsisWidth + nameWidth) continue;
				applyCandidate({ visible: [], ellipsisIndex: 0, canTruncateName: true });
				return;
			}

			const rightCount = Math.ceil(keepCount / 2);
			const leftCount = keepCount - rightCount;

			const width =
				sum(partWidths.slice(0, leftCount)) + ellipsisWidth + sum(partWidths.slice(parts.length - rightCount)) + nameWidth;

			if (width <= available) {
				applyCandidate({
					visible: [...parts.slice(0, leftCount), ...parts.slice(parts.length - rightCount)],
					ellipsisIndex: leftCount,
					canTruncateName: false,
				});
				return;
			}
		}

		applyCandidate({ visible: [], ellipsisIndex: 0, canTruncateName: true });
	}

	let raf = 0;
	const widthStabilityEpsilon = 0.5;

	function scheduleUpdateOverflow() {
		cancelAnimationFrame(raf);

		raf = requestAnimationFrame(() => {
			if (!container) return;

			const before = container.getBoundingClientRect().width;

			raf = requestAnimationFrame(() => {
				if (!container) return;

				const after = container.getBoundingClientRect().width;

				if (Math.abs(after - before) > widthStabilityEpsilon) {
					scheduleUpdateOverflow();
					return;
				}

				updateOverflow();
			});
		});
	}

	$effect(() => {
		parts;
		item.name;

		scheduleUpdateOverflow();

		const ro = new ResizeObserver(scheduleUpdateOverflow);

		if (container) ro.observe(container);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	});
</script>

{#if item.parents}
	<span bind:this={container} class:initialized class="Path parents" data-sveltekit-reload>
		<span class:canTruncateName class="path">
			{#each visibleParts as part, index (part.id)}
				{#if ellipsisIndex === index}
					<span class="ellipsis">...</span>
				{/if}

				<a
					href={part.href}
					{@attach onDropMove && drag.target('storage', ids => onDropMove(ids, part.id == 'root' ? null : part.id))}
				>
					{part.name}
				</a>
			{/each}

			{#if ellipsisIndex === visibleParts.length}
				<span class="ellipsis">...</span>
			{/if}

			<span class="name">{item.name}</span>
		</span>

		<span bind:this={measure} class="measurement" aria-hidden="true">
			{#each parts as part (part.id)}
				<a data-part href={part.href} tabindex="-1">{part.name}</a>
			{/each}

			<span data-ellipsis class="ellipsis">...</span>
			<span data-name class="name">{item.name}</span>
		</span>
	</span>
{:else}
	<span class="Path name standalone">{item.name}</span>
{/if}

<style>
	.standalone,
	.parents {
		display: block;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}

	.parents {
		position: relative;
		visibility: hidden;

		&.initialized {
			visibility: visible;
		}
	}

	.path {
		display: inline-flex;
		max-width: 100%;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;

		a,
		.ellipsis {
			flex: none;
		}

		a::after,
		.ellipsis::after {
			content: ' / ';
			color: #888;
		}

		.name {
			flex: none;
			white-space: nowrap;
		}

		&.canTruncateName {
			.name {
				flex: 1 1 auto;
				min-width: 0;
				overflow: hidden;
				text-overflow: ellipsis;
			}
		}
	}

	.measurement {
		position: absolute;
		inset: 0 auto auto 0;
		display: inline-flex;
		width: max-content;
		max-width: none;
		overflow: visible;
		visibility: hidden;
		pointer-events: none;
		white-space: nowrap;
		contain: layout style;

		a,
		.ellipsis,
		.name {
			flex: none;
			white-space: nowrap;
		}

		a::after,
		.ellipsis::after {
			content: ' / ';
			color: #888;
		}
	}

	.standalone {
		text-overflow: ellipsis;
	}
</style>
