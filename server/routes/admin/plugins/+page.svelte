<script lang="ts">
	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Plugins</title>
</svelte:head>

<h2>Plugins</h2>

{#each data.plugins as plugin}
	<h3>{plugin.name}<span class="version">{plugin.version}</span></h3>
	<p>
		<strong>Loaded from</strong>
		{#if plugin.path.endsWith('/package.json')}
			<span class="path plugin-path">{plugin.path.slice(0, -13)}</span>
		{:else}
			<span class="path">{plugin.path}</span>
		{/if}
		{#if plugin._loadedBy}
			by
			<a class="path" href="/admin/config#{plugin._loadedBy}">{plugin._loadedBy}</a>
		{/if}
	</p>
	<p><strong>Author:</strong> {plugin.author}</p>
	<p class="apps">
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

<style>
	.version {
		font-family: monospace;
		font-size: 0.9em;
		color: #aaa;
		margin-left: 1em;
	}

	.version::before {
		content: 'v';
		color: #888;
	}

	.path {
		font-family: monospace;
	}

	.plugin-path::after {
		content: '/package.json';
		color: #888;
	}

	.apps a {
		text-decoration: underline;
	}
</style>
