<script lang="ts">
	import { Version, ZodForm } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import { serverConfigs } from '@axium/core';

	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Plugins</title>
</svelte:head>

<h2>Plugins</h2>

{#each data.plugins as plugin}
	{@const cfg = serverConfigs.get(plugin.name)}
	<div class="plugin">
		<h3>{plugin.name}<Version v={plugin.version} latest={plugin.latest} /></h3>
		<p>
			<strong>Loaded from</strong>
			{#if plugin.path.endsWith('/package.json')}
				<span class="path plugin-path">{plugin.path.slice(0, -13)}</span>
			{:else}
				<span class="path">{plugin.path}</span>
			{/if}
			{#if plugin.loadedBy}
				by
				<a class="path" href="/admin/config#{plugin.loadedBy}">{plugin.loadedBy}</a>
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
		{#if cfg && plugin.config}
			<h4>Configuration</h4>
			{@const { schema, labels } = cfg}
			<ZodForm
				rootValue={plugin.config}
				{schema}
				{labels}
				updateValue={config => fetchAPI('POST', 'admin/plugins', { plugin: plugin.name, config })}
			/>
		{/if}
	</div>
{:else}
	<i>No plugins loaded.</i>
{/each}

<style>
	.plugin {
		border-radius: 1em;
		padding: 1em;
		background-color: var(--bg-menu);
		margin-bottom: 1em;
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
