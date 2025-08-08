<script lang="ts">
	import { StorageList } from '@axium/storage/components';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<StorageList appMode bind:items={data.items} />
