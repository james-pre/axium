<script lang="ts">
	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Plugins</title>
</svelte:head>

<h2>Plugins</h2>

{#each data.plugins as plugin}
	<h4>{plugin.name}</h4>
	<p><strong>Loaded from</strong> {plugin.path} by {plugin._loadedBy ?? '<unknown>'}</p>
	<p><strong>Version:</strong> {plugin.version}</p>
	<p><strong>Author:</strong> {plugin.author}</p>
	<p>
		<strong>Provided apps:</strong>
		{#if plugin.apps?.length}
			{#each plugin.apps as app, i}
				<a href="/{app.id}">{app.name}</a>{i != plugin.apps.length - 1 ? ', ' : ''}
			{/each}
		{:else}<i>None</i>{/if}
	</p>
	<p>{plugin.description}</p>
{:else}
	<i>No plugins loaded.</i>
{/each}
