<script lang="ts">
	import Icon from './Icon.svelte';
	const { children, toggle }: { children(): any; toggle?(): any } = $props();

	let popover = $state<HTMLDivElement>();

	function onclick(e: MouseEvent) {
		e.stopPropagation();
		popover?.togglePopover();
	}
</script>

<div onclick={e => e.stopPropagation()}>
	<div style:display="contents" {onclick}>
		{#if toggle}
			{@render toggle()}
		{:else}
			<span class="popover-toggle">
				<Icon i="ellipsis" />
			</span>
		{/if}
	</div>

	<div popover bind:this={popover}>
		{@render children()}
	</div>
</div>

<style>
	.popover-toggle:hover {
		cursor: pointer;
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
