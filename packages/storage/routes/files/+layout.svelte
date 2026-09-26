<script lang="ts">
	import { page } from '$app/state';
	import SidebarLayout from '@axium/client/components/SidebarLayout';
	import { Usage } from '@axium/storage/components';

	let { children, data } = $props();
</script>

<SidebarLayout tabs={data.tabs}>
	{#snippet bottom()}
		<Usage userId={data.session?.userId} />
	{/snippet}

	{#key page.url.pathname}
		{@render children()}
	{/key}
</SidebarLayout>
