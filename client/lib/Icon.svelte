<script lang="ts">
	const { i, ...rest } = $props();
	const [style, id] = $derived(i.includes('/') ? i.split('/') : ['solid', i]);
	const href = $derived(`/icons/${style}.svg#${id}`);
</script>

<svg class="Icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" {...rest}>
	<use {href} />
</svg>

<style>
	svg {
		width: var(--size, 1em);
		height: var(--size, 1em);
		display: inline-block;
		fill: var(--fill, hsl(var(--hue) 0 var(--fg-light)));
	}
</style>
