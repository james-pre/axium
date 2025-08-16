<script lang="ts">
	import { fetchAPI } from '@axium/client/requests';
	import { Icon, Popover } from '@axium/server/components';
	import type { Task, TaskList } from '@axium/tasks/common';
	import type { WithRequired } from 'utilium';

	let { list = $bindable() }: { list: WithRequired<TaskList, 'tasks'> } = $props();

	let tasks = $state(list.tasks);
</script>

{#snippet task_tree(root: Task)}
	<div class="task">
		<button>
			<Icon i="regular/circle{root.completed ? '-check' : ''}" />
		</button>
		<span>{root.summary}</span>
		<Popover>
			<span
				class="icon-text"
				onclick={e => {
					e.stopPropagation();
					fetchAPI('DELETE', 'tasks/:id', {}, root.id).then(() => {
						tasks.splice(tasks.indexOf(root), 1);
					});
				}}><Icon i="trash" /> Delete</span
			>
		</Popover>
	</div>
	{#each tasks.filter(task => task.parentId == root.id) as child}
		{@render task_tree(child)}
	{/each}
{/snippet}

<div class="task-list">
	<h3>Pending</h3>
	{#each tasks.filter(task => !task.parentId && !task.completed) as task}
		{@render task_tree(task)}
	{:else}
		<i>No pending tasks.</i>
	{/each}
	<h3>Completed</h3>
	{#each tasks.filter(task => !task.parentId && task.completed) as task}
		{@render task_tree(task)}
	{:else}
		<i>No completed tasks.</i>
	{/each}
</div>

<style>
	.task {
		display: grid;
		grid-template-columns: 1em 1fr 2em;
		align-items: center;

		.task {
			padding-left: 1em;
		}
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
</style>
