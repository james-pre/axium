<script lang="ts">
	import { text } from '@axium/client/locales';
	import { fetchAPI } from '@axium/client/requests';
	import Boundary from './Boundary.svelte';
	import Icon from './Icon.svelte';
</script>

<Boundary pending="generic.loading" error="AppMenu.failed" inline>
	{#each await fetchAPI('GET', 'apps') as app}
		<a class="menu-item" href="/{app.id}">
			{#if app.image}
				<img src={app.image} alt={app.name} width="1em" height="1em" />
			{:else if app.icon}
				<Icon i={app.icon} --size="1.5em" />
			{:else}
				<Icon i="image-circle-xmark" --size="1.5em" />
			{/if}
			<span>{text('app_name.' + app.id, { $default: app.name })}</span>
		</a>
	{:else}
		<i>{text('AppMenu.none')}</i>
	{/each}
</Boundary>
