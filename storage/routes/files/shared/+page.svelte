<script lang="ts">
	import { List } from '@axium/storage/components';

	const { data } = $props();
	let items = $state(data.items!);
</script>

<svelte:head>
	<title>Files - Shared With You</title>
</svelte:head>

<List appMode bind:items emptyText="No items have been shared with you." user={data.session?.user} />
