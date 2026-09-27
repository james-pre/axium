<script lang="ts">
	import { page } from '$app/state';
	import { text } from '@axium/client';
	import { SidebarLayout, TopBarContent } from '@axium/client/components';
	import { Usage } from '@axium/storage/components';

	let { children, data } = $props();
</script>

<TopBarContent name={text('app_name.files')} icon="folders" href="/files" />

<SidebarLayout tabs={data.tabs}>
	{#snippet bottom()}
		<Usage userId={data.session?.userId} />
	{/snippet}

	{#key page.url.pathname}
		{@render children()}
	{/key}
</SidebarLayout>
