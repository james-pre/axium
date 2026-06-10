<script lang="ts">
	import { text } from '@axium/client';
	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.admin.config.title')}</title>
</svelte:head>

<h2>{text('page.admin.config.active')}</h2>

<pre>{JSON.stringify(data.config, null, 4)}</pre>

<h2 id="files">{text('page.admin.config.loaded_files')}</h2>

{#each Object.entries(data.files) as [path, config]}
	<details>
		<summary>{path}</summary>
		<pre id={path}>{JSON.stringify(config, null, 4)}</pre>
	</details>
{/each}

<style>
	summary {
		cursor: pointer;
		padding: 1em 0;
		font-size: large;
	}
</style>
