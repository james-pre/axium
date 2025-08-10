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
			<Icon i="ellipsis" />
		{/if}
	</div>

	<div popover bind:this={popover}>
		{@render children()}
	</div>
</div>
