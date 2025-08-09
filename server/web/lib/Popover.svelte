<script lang="ts">
	import Icon from './Icon.svelte';
	const { children, toggle }: { children(): any; toggle?(): any } = $props();

	const id = $props.id();
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
