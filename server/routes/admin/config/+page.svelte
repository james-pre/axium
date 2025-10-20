<script lang="ts">
	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Configuration</title>
</svelte:head>

<h2>Active Configuration</h2>

<pre>{JSON.stringify(data.config, null, 4)}</pre>

<h2>Load Files</h2>

{#each Object.entries(data.files) as [path, config]}
	<details>
		<summary>{path}</summary>
		<pre>{JSON.stringify(config, null, 4)}</pre>
	</details>
{/each}

<style>
	pre {
		background-color: var(--bg-menu);
		padding: 1em;
		border-radius: 0.5em;
	}
</style>
