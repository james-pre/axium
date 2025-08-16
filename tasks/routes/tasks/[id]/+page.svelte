<script lang="ts">
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();
</script>

<svelte:head>
	<title>Tasks — {data.list.name}</title>
</svelte:head>

<TaskList list={data.list} />
