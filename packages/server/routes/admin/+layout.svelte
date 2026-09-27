<script lang="ts">
	import { text } from '@axium/client';
	import { SidebarLayout, TopBarContent } from '@axium/client/components';
	let { children, data } = $props();
</script>

<TopBarContent name={text('UserMenu.admin')} icon="gear-complex" href="/admin" />

<SidebarLayout tabs={data.tabs}>
	{@render children()}
</SidebarLayout>
