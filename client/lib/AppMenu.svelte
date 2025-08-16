<script lang="ts">
	import { fetchAPI } from '@axium/client/requests';
	import Icon from './Icon.svelte';
	import Popover from './Popover.svelte';
</script>

<Popover>
	{#snippet toggle()}
		<button style:display="contents">
			<Icon i="grid" --size="1.5em" />
		</button>
	{/snippet}

	{#await fetchAPI('GET', 'apps')}
		<i>Loading...</i>
	{:then apps}
		{#each apps as app}
			<a class="menu-item" href="/{app.id}">
				{#if app.image}
					<img src={app.image} alt={app.name} width="1em" height="1em" />
				{:else if app.icon}
					<Icon i={app.icon} --size="1.5em" />
				{:else}
					<Icon i="image-circle-xmark" --size="1.5em" />
				{/if}
				<span>{app.name}</span>
			</a>
		{:else}
			<i>No apps available.</i>
		{/each}
	{:catch}
		<i>Couldn't load apps.</i>
	{/await}
</Popover>
