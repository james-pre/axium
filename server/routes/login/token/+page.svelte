<script lang="ts">
	import { text } from '@axium/client';
	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.login.failed')}</title>
</svelte:head>

<div class="error center">
	<p>{data.error}</p>
</div>

<style>
	div.center {
		width: fit-content;
		height: fit-content;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		position: fixed;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 2em;
		border-radius: 1em;
	}
</style>
