<script lang="ts">
	import SidebarLayout from '@axium/client/components/SidebarLayout';
	import { Usage } from '@axium/storage/components';

	let { children, data } = $props();
</script>

<SidebarLayout tabs={data.tabs}>
	{#snippet bottom()}
		<Usage userId={data.session?.userId} />
	{/snippet}

	{@render children()}
</SidebarLayout>
