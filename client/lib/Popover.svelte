<script lang="ts">
	import Icon from './Icon.svelte';
	const { children, toggle, showToggle }: { children(): any; toggle?(): any; showToggle?: 'hover' | 'always' } = $props();

	let popover = $state<HTMLDivElement>();

	function onclick(e: MouseEvent) {
		e.stopPropagation();
		// @ts-expect-error 2345
		popover?.togglePopover({ source: e.currentTarget });
	}
</script>

<div {onclick}>
	{#if toggle}
		{@render toggle()}
	{:else}
		<span class={['popover-toggle', showToggle == 'hover' && 'toggle-hover']}>
			<Icon i="ellipsis" />
		</span>
	{/if}

	<div popover bind:this={popover}>
		{@render children()}
	</div>
</div>

<style>
	.popover-toggle:hover {
		cursor: pointer;
	}

	.popover-toggle {
		user-select: none;
	}

	@media (width > 700px) {
		.toggle-hover {
			visibility: hidden;
		}

		:global(:hover) > div > .toggle-hover {
			visibility: visible;
		}
	}

	.popover-toggle + [popover] {
		position-try-fallbacks:
			flip-inline,
			flip-block,
			flip-block flip-inline;
		position-visibility: always;
		left: anchor(left);
		top: anchor(bottom);
	}
</style>
