<script lang="ts">
	import Icon from './Icon.svelte';
	const { children, toggle }: { children(): any; toggle?(): any } = $props();

	let popover = $state<HTMLDivElement>();

	function onclick(e: MouseEvent) {
		e.stopPropagation();
		// @ts-expect-error 2345
		popover?.togglePopover({ source: e.currentTarget });
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div {onclick}>
	{#if toggle}
		{@render toggle()}
	{:else}
		<span class="popover-toggle">
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

	.popover-toggle + [popover] {
		position-area: bottom right;
		position-try: most-width flip-inline;
	}

	[popover] :global(.menu-item) {
		display: inline-flex;
		align-items: center;
		padding: 0.5em 0.75em;
		gap: 1em;
		border-radius: 0.5em;

		&:hover {
			background-color: var(--bg-strong);
			cursor: pointer;
		}
	}
</style>
