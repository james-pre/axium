<script lang="ts">
	import Icon from './Icon.svelte';
	const {
		children,
		toggle,
		id = 'popover#' + Math.random().toString(36).substring(2, 15),
	}: { children(): any; toggle?(): any; id?: string } = $props();
</script>

<div onclick={e => e.stopPropagation()}>
	<button style:display="contents" popovertarget={id}>
		{#if toggle}
			{@render toggle()}
		{:else}
			<Icon i="ellipsis" />
		{/if}
	</button>

	<div {id} popover>
		{@render children()}
	</div>
</div>
