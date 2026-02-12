<script lang="ts">
	import { Add, List } from '@axium/storage/components';

	const { data } = $props();
	let items = $state(data.items!);
</script>

<svelte:head>
	<title>Files</title>
</svelte:head>

<List appMode bind:items user={data.session?.user} />
<Add onAdd={item => items.push(item)} />
