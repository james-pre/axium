<script lang="ts">
	import { fade } from 'svelte/transition';

	const { enabled, children, delay = 5000, duration = 1000, ...rest } = $props();

	let hiding = $state(false);

	const show = $derived(enabled && !hiding);
</script>

{#if show}
	<div
		class="Toast"
		in:fade|global={{ duration }}
		onintroend={() => (hiding = true)}
		out:fade|global={{ delay, duration }}
		onoutroend={() => (hiding = false)}
		{...rest}
	>
		{@render children()}
	</div>
{/if}

<style>
	.Toast {
		position: fixed;
		bottom: 1em;
		left: calc(50% - 10em);
		right: calc(50% - 10em);
		width: 20em;
		padding: 0.5em 1em;
		border-radius: 1em;
		opacity: 0.5;
	}
</style>
