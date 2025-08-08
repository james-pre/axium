<script lang="ts">
	import { Icon } from '@axium/server/components';
	import { capitalize } from 'utilium';
	import { StorageUsage } from '@axium/storage/components';
	import type { Session } from '@axium/core';
	import type { LayoutProps, LayoutRouteId } from './$types';

	type SidebarTab = 'files' | 'trash' | 'shared' | 'usage';

	let { children, data }: LayoutProps = $props();
</script>

{#snippet tab(text: string, i: string, href: LayoutRouteId, isDefault: boolean = false)}
	<a class={['item', data.route.id == href || (data.route.id == '/files/[id]' && isDefault)]} {href}><Icon {i} />{capitalize(text)}</a>
{/snippet}

<div class="app">
	<div class="sidebar">
		{@render tab('Files', 'folders', '/files', true)}
		{@render tab('Trash', 'trash', '/files/trash')}
		{@render tab('Shared', 'user-group', '/files/shared')}

		<div class="usage">
			<StorageUsage userId={data.session.userId} />
		</div>
	</div>

	<div class="content">
		{@render children()}
	</div>
</div>

<style>
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
