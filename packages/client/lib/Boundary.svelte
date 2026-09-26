<script lang="ts">
	import * as err from '@axium/client/error';
	import type { Snippet } from 'svelte';
	import { text } from '@axium/client/locales';

	interface Props {
		children?: Snippet;
		pending?: Snippet | string;
		inline?: boolean;
		showStack?: boolean;
		/** Translation key */
		error?: string;
	}

	const { children, pending: loading, inline, showStack, error: errorKey }: Props = $props();
</script>

<svelte:boundary>
	{@render children?.()}

	{#snippet pending()}
		{#if typeof loading == 'string'}
			<span>{text(loading)}</span>
		{:else}
			{@render loading?.()}
		{/if}
	{/snippet}

	{#snippet failed(error: any)}
		{const message = err.message(error, errorKey)}
		{#if inline}
			<p class="error boundary">{message}</p>
		{:else}
			<div class="error boundary">
				<p>{message}</p>

				{#if error.stack && showStack}
					<pre>{error.stack}</pre>
				{/if}
			</div>
		{/if}
	{/snippet}
</svelte:boundary>

<style>
	div.boundary.error {
		margin: 1em;
	}
</style>
