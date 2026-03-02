<script lang="ts">
	import { text } from '@axium/client';
	import { List } from '@axium/storage/components';

	const { data } = $props();
	let items = $state(data.items!);
</script>

<svelte:head>
	<title>{text('page.files.shared.title')}</title>
</svelte:head>

<List appMode bind:items emptyText={text('page.files.shared.empty')} user={data.session?.user} />
