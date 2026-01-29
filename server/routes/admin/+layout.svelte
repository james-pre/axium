<script lang="ts">
	import SidebarLayout from '@axium/client/components/SidebarLayout';
	let { children, data } = $props();
</script>

<SidebarLayout tabs={data.tabs}>
	{@render children()}
</SidebarLayout>
