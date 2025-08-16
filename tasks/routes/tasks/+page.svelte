<script lang="ts">
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();
</script>

{#each data.lists as list}
	<TaskList {list} />
{/each}
