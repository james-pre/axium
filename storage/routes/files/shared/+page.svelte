<script lang="ts">
	import { StorageList } from '@axium/storage/components';

	const { data } = $props();
	let items = $state(data.items!);
</script>

<svelte:head>
	<title>Files - Shared With You</title>
</svelte:head>

<StorageList appMode bind:items emptyText="No items have been shared with you." user={data.session?.user} />
