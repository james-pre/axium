<script lang="ts">
	import light from './light.svg';
	import solid from './solid.svg';
	import regular from './regular.svg';
	const urls = { light, solid, regular };
	const { i } = $props();

	const [style, id] = i.includes('/') ? i.split('/') : ['solid', i];
	const url = urls[style];
</script>

<svelte:head>
	<link rel="preload" href={url} />
</svelte:head>

<span>
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em">
		<use href="{url}#{id}" />
	</svg>
</span>

<style>
	span {
		width: var(--size, 1em);
		height: var(--size, 1em);
		display: inline-block;
		fill: #bbb;
	}
</style>
