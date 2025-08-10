<script lang="ts">
	import { StorageAdd, StorageList } from '@axium/storage/components';

	const { data } = $props();
	let items = $state(data.items!);
</script>

<svelte:head>
	<title>Files</title>
</svelte:head>

<StorageList appMode bind:items />
<StorageAdd onadd={item => items.push(item)} />
