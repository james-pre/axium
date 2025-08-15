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

	<div class="app-menu">
		{#await fetchAPI('GET', 'apps')}
			<i>Loading...</i>
		{:then apps}
			{#each apps as app}
				<a class="app-menu-item icon-text" href="/{app.id}">
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
	</div>
</Popover>

<style>
	.app-menu {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
		background-color: #111;
		border: 1px solid #112;
		border-radius: 0.5em;
	}

	.app-menu-item {
		display: grid;
		grid-template-columns: 2em 1fr;
		gap: 1em;
		padding: 0.5em 1em;
	}

	.app-menu-item:hover {
		background-color: #223;
	}

	.app-menu-item:not(:last-child) {
		border-bottom: 1px solid #222;
	}
</style>
