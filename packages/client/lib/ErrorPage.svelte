<script lang="ts">
	import { page } from '$app/state';
	import { title, message } from '@axium/client/error';
	import { text } from '@axium/client/locales';

	interface PageError {
		message: string;
		status?: number;
		stack?: string;
	}

	const error: PageError = page.error || { message: 'Unknown Error' };

	const showStack = page.url.searchParams.has('stack');
</script>

<svelte:head>
	<title>Error — {title(error)}</title>
</svelte:head>

<div class="error">
	<h2>{message(error)}</h2>
	{#if error.stack && showStack}
		<pre>{error.stack}</pre>
	{/if}
</div>

<button onclick={() => location.reload()}>{text('error.Page.reload')}</button>

<style>
	.error {
		margin: 1em;
	}
</style>
