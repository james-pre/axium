<script lang="ts">
	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Configuration</title>
</svelte:head>

<h2>Active Configuration</h2>

<pre>{JSON.stringify(data.config, null, 4)}</pre>

<h2 id="files">Loaded Files</h2>

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
