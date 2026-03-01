<script lang="ts">
	import { error } from '@axium/core/io';
	import { lt as ltVersion } from 'semver';

	const { v, latest: _latest }: { v: string; latest?: string | null | Promise<string> } = $props();

	if (_latest && typeof _latest != 'string') _latest.catch(error);
</script>

<span class="version">{v}</span>

{#if _latest}
	{#await _latest then latest}
		<span class="latest">
			{#if ltVersion(v, latest)}
				<span class="version">{latest}</span> available
			{:else}
				Latest
			{/if}
		</span>
	{:catch}
		<span class="latest error">Latest unknown</span>
	{/await}
{/if}

<style>
	.latest {
		font-size: 0.9em;
		background-color: var(--bg-strong);
		padding: 0.25em 0.75em;
		border-radius: 1em;
	}

	.error {
		border: var(--border-error);
	}

	:global(h1 h2, h3, h4, h5, h6) {
		.latest {
			margin-left: 1em;

			.version {
				margin-left: unset;
			}
		}
	}
</style>
