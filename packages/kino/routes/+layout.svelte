<script lang="ts">
	import { page } from '$app/state';
	import { text } from '@axium/client';
	import { SidebarLayout, TopBarContent } from '@axium/client/components';
	import { SearchBar } from '@axium/kino/components';

	let { children, data } = $props();
</script>

<TopBarContent name={text('app_name.kino')} icon="popcorn" href="/kino">
	<SearchBar />
</TopBarContent>

<SidebarLayout tabs={data.tabs}>
	<div class="kino">
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
