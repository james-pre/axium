<script lang="ts">
	import { StorageList } from '@axium/storage/components';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Files</title>
</svelte:head>

<StorageList appMode bind:items={data.items} />
