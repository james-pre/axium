<script lang="ts">
	import { Icon } from '@axium/client/components';
	import { StorageUsage } from '@axium/storage/components';
	import { capitalize } from 'utilium';

	let { children, data } = $props();
</script>

<div class="app">
	<div class="sidebar">
		{#each data.tabs as { href, name, icon: i, active }}
			<a {href} class={['item', 'icon-text', active && 'active']}><Icon {i} /> {capitalize(name)}</a>
		{/each}

		<div class="usage">
			<StorageUsage userId={data.session.userId} />
		</div>
	</div>

	<div class="files-content">
		{@render children()}
	</div>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: 15em 1fr;
		height: 100%;
	}

	.sidebar {
		grid-column: 1;
		width: 100%;
		display: inline-flex;
		flex-direction: column;
		gap: 0.5em;
		padding-left: 1em;
	}

	.item {
		padding: 0.3em 0.5em;
		border-radius: 0.25em 1em 1em 0.25em;
	}

	.item:hover {
		background-color: var(--bg-accent);
		cursor: pointer;
	}

	.item.active {
		background-color: var(--bg-accent);
	}

	.usage {
		margin-top: auto;
	}

	.files-content {
		grid-column: 2;
		padding: 1em;
		overflow-x: hidden;
		overflow-y: scroll;
	}
</style>
