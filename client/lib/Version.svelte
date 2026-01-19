<script lang="ts">
	const { v, latest }: { v: string; latest?: string | null } = $props();
	import { lt as ltVersion } from 'semver';
</script>

<span class="version">{v}</span>

{#if latest}
	<span class="latest">
		{#if ltVersion(v, latest)}
			<span class="version">{latest}</span> available
		{:else}
			Latest
		{/if}
	</span>
{/if}

<style>
	.latest {
		font-size: 0.9em;
		background-color: var(--bg-strong);
		padding: 0.25em 0.75em;
		border-radius: 1em;
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
