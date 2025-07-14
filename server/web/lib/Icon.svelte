<script lang="ts">
	const { i } = $props();
	const [style, id] = $derived(i.includes('/') ? i.split('/') : ['solid', i]);
	const href = $derived(`/icons/${style}.svg#${id}`);
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em">
	<use {href} />
</svg>

<style>
	svg {
		width: var(--size, 1em);
		height: var(--size, 1em);
		display: inline-block;
		fill: var(--fill, #bbb);
	}
</style>
