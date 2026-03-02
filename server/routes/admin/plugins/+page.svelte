<script lang="ts">
	import { text } from '@axium/client';
	import { Version, ZodForm } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import { serverConfigs } from '@axium/core';
	import { getPackage } from '@axium/core/packages';
	import { _throw } from 'utilium';

	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.admin.plugins.title')}</title>
</svelte:head>

<h2>{text('page.admin.plugins.heading')}</h2>

{#each data.plugins as plugin}
	{@const cfg = serverConfigs.get(plugin.name)}
	<div class="plugin">
		<h3>
			{plugin.name}<Version
				v={plugin.version}
				latest={plugin.update_checks ? getPackage(plugin.name).then(p => p?._latest || _throw(null)) : null}
			/>
		</h3>
		<p>
			<strong>{text('page.admin.plugins.loaded_from')}</strong>
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
		<p><strong>{text('page.admin.plugins.author')}</strong> {plugin.author}</p>
		<p class="apps">
			<strong>{text('page.admin.plugins.provided_apps')}</strong>
			{#if plugin.apps?.length}
				{#each plugin.apps as app, i}
					<a href="/{app.id}">{app.name}</a>{i != plugin.apps.length - 1 ? ', ' : ''}
				{/each}
			{:else}<i>{text('generic.none')}</i>{/if}
		</p>
		<p>{plugin.description}</p>
		{#if cfg && plugin.config}
			<h4>{text('page.admin.plugins.configuration')}</h4>
			{@const { schema, labels } = cfg}
			<ZodForm
				rootValue={plugin.config}
				idPrefix={plugin.name}
				{schema}
				{labels}
				updateValue={config => fetchAPI('POST', 'admin/plugins', { plugin: plugin.name, config })}
			/>
		{/if}
	</div>
{:else}
	<i>{text('page.admin.plugins.none')}</i>
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

	.plugin :global(label:not(.checkbox)) {
		font-family: monospace;
	}
</style>
