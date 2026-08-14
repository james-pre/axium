<script lang="ts">
	import { page } from '$app/state';

	interface PageError {
		message: string;
		status?: number;
		stack?: string;
	}

	const error: PageError = page.error || { message: 'Unknown Error' };
	const [title] = error.message.split('\n');

	const showStack = page.url.searchParams.has('stack');
</script>

<svelte:head>
	<title>Error — {title}</title>
</svelte:head>

<div class="error">
	<h2>{error.message}</h2>
	{#if error.stack && showStack}
		<pre>{error.stack}</pre>
	{/if}
</div>

<style>
	.error {
		margin: 1em;
	}
</style>
