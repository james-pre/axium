<script lang="ts">
	import { text } from '@axium/client/locales';
	import { fetchAPI } from '@axium/client/requests';
	import feature from '@axium/core/features';
	import Boundary from './Boundary.svelte';
	import Icon from './Icon.svelte';
</script>

<Boundary pending="generic.loading" error="AppMenu.failed" inline>
	<div class={['AppList', feature('app-list-is-grid') && 'grid']}>
		{#each await fetchAPI('GET', 'apps') as app}
			<a class="menu-item" href="/{app.id}">
				{#if app.image}
					<img src={app.image} alt={app.name} />
				{:else if app.icon}
					<Icon i={app.icon} --size="1.5em" />
				{:else}
					<Icon i="image-circle-xmark" --size="1.5em" />
				{/if}
				<span>{text('app_name.' + app.id, { $default: app.name || '(unknown)' })}</span>
			</a>
		{:else}
			<i>{text('AppMenu.none')}</i>
		{/each}
	</div>
</Boundary>

<style>
	.AppList {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
	}

	img {
		width: 1.5em;
		height: 1.5em;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 6.5em);
		gap: 0.25em;

		.menu-item {
			flex-direction: column;
			justify-content: center;
			gap: 0.5em;
			padding: 0.75em 0.25em;
			text-align: center;
			font-size: 0.9em;

			:global(.Icon) {
				--size: 2em;
			}
		}

		img {
			width: 2em;
			height: 2em;
		}

		@media (width < 700px) {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
