<script lang="ts">
	import Icon from './Icon.svelte';

	const { children, toggle }: { children(): any; toggle?(): any } = $props();

	const id = 'popover#' + Math.random().toString(36).substring(2, 15);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
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
