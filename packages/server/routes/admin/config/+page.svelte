<script lang="ts">
	import { text } from '@axium/client';
	import { SecretStatus } from '@axium/client/components';
	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.admin.config.title')}</title>
</svelte:head>

<h2 class="sidebar-theme-alt">{text('page.admin.config.active')}</h2>

<pre>{JSON.stringify(data.config, null, 4)}</pre>

<h2>{text('page.admin.config.secrets')}</h2>

<div class="secrets">
	{#each Object.entries(data.secrets) as [path, info]}
		<span class="path">{path}</span>
		<SecretStatus {info} />
	{/each}
</div>

<h2 id="files">{text('page.admin.config.loaded_files')}</h2>

{#each Object.entries(data.files) as [path, config]}
	<details>
		<summary>{path}</summary>
		<pre id={path}>{JSON.stringify(config, null, 4)}</pre>
	</details>
{/each}

<style>
	.secrets {
		display: grid;
		grid-template-columns: fit-content(50%) minmax(0, 1fr);
		align-items: center;
		gap: 0.75em 1.5em;
	}

	.path {
		font-family: monospace;
	}

	summary {
		cursor: pointer;
		padding: 1em 0;
		font-size: large;
	}
</style>
