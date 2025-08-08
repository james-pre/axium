<script lang="ts">
	import { Icon } from '@axium/server/components';
	import { StorageUsage } from '@axium/storage/components';
	import { capitalize } from 'utilium';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<div class="app">
	<div class="sidebar">
		{#each data.tabs as { href, name, icon: i, active }}
			<a {href} class={['item', active && 'active']}><Icon {i} /> {capitalize(name)}</a>
		{/each}

		<div class="usage">
			<StorageUsage userId={data.session.userId} />
		</div>
	</div>

	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: 20em 1fr;
		height: 100%;
	}

	.content {
		padding: 1em;
		overflow-x: hidden;
		overflow-y: scroll;
	}

	.sidebar {
		width: 20em;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.item {
		padding: 0.5em;
		border-radius: 0.25em;
	}

	.item:hover {
		background-color: #446;
		cursor: pointer;
	}

	.item.active {
		background-color: #447;
	}

	.usage {
		align-self: flex-end;
	}
</style>
