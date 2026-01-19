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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
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
		position-try: flip-inline;
		position-visibility: always;
		left: anchor(left);
		top: anchor(bottom);
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
