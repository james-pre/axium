<script lang="ts">
	import { text } from '@axium/client';
	import Folder from './Folder.svelte';

	const { data } = $props();
	let items = $state(data.items!);
</script>

<svelte:head>
	<title>{text('page.files.title')}</title>
</svelte:head>

<Folder bind:items user={data.session?.user} id={null} />
