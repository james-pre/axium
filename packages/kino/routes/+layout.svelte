<script lang="ts">
	import { page } from '$app/state';
	import { SidebarLayout } from '@axium/client/components';
	import { SearchBar } from '@axium/kino/components';

	let { children, data } = $props();
</script>

<SidebarLayout tabs={data.tabs}>
	<div class="kino">
		<SearchBar />
		{#key page.url.pathname}
			{@render children()}
		{/key}
	</div>
</SidebarLayout>

<style>
	.kino {
		display: flex;
		flex-direction: column;
		gap: 1.5em;
		padding: 0.5em;
	}
</style>
