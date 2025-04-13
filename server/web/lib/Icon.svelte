<script lang="ts">
	import { onMount } from 'svelte';

	const { id } = $props();

	const withStyle = id.includes('/') ? id : 'solid/' + id;
	const href = `https://site-assets.fontawesome.com/releases/v6.7.2/svgs/${withStyle}.svg`;

	let content = $state('');

	// Fetch and inline the SVG content on component mount
	onMount(async () => {
		const res = await fetch(href);

		if (!res.ok) {
			console.error('Failed to fetch icon:', res.statusText);
			return;
		}

		const text = await res.text();

		const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
		const errorNode = doc.querySelector('parsererror');

		if (errorNode || doc.documentElement?.nodeName != 'svg') {
			console.error('Invalid SVG');
			return;
		}

		content = text;
	});
</script>

<svelte:head>
	<link rel="preload" {href} />
</svelte:head>

<span>{@html content}</span>

<style>
	span {
		width: var(--size, 1em);
		height: var(--size, 1em);
		display: inline-block;
		fill: #bbb;
	}
</style>
