<script lang="ts">
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();
</script>

<TaskList list={data.list} />
