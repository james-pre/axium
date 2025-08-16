<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchAPI } from '@axium/client/requests';
	import { Icon, Popover } from '@axium/server/components';
	import type { Task, TaskList } from '@axium/tasks/common';
	import type { WithRequired } from 'utilium';

	let { list = $bindable(), lists = $bindable() }: { list: WithRequired<TaskList, 'tasks'>; lists?: WithRequired<TaskList, 'tasks'>[] } =
		$props();

	let tasks = $state(list.tasks);
</script>

{#snippet task_tree(root: Task)}
	<form class="task">
		<div>
			<Icon i="regular/circle{root.completed ? '-check' : ''}" />
		</div>
		<span>{root.summary}</span>
		<Popover>
			<div
				class="menu-item"
				onclick={e => {
					e.stopPropagation();
					fetchAPI('DELETE', 'tasks/:id', {}, root.id).then(() => {
						tasks.splice(tasks.indexOf(root), 1);
					});
				}}
			>
				<Icon i="trash" /> Delete
			</div>
		</Popover>
	</form>
	{#each tasks.filter(task => task.parentId == root.id) as child}
		{@render task_tree(child)}
	{/each}
{/snippet}

<div class="task-list">
	<div class="task-list-header">
		<h3>{list.name}</h3>
		<Popover>
			<div
				class="menu-item"
				onclick={e => {
					e.stopPropagation();
					fetchAPI('DELETE', 'task_lists/:id', {}, list.id).then(() => {
						if (!lists) goto('/tasks');
						else lists.splice(lists.indexOf(list), 1);
					});
				}}
			>
				<Icon i="trash" /> Delete
			</div>
		</Popover>
	</div>
	<div>
		<button
			class="icon-text"
			onclick={e => {
				e.stopPropagation();
				fetchAPI('PUT', 'task_lists/:id', { summary: '' }, list.id)
					.then(t => t)
					.then(tasks.push.bind(tasks));
			}}
		>
			<Icon i="regular/circle-plus" /> Add Task
		</button>
	</div>
	<h4>Pending</h4>
	{#each tasks.filter(task => !task.parentId && !task.completed) as task}
		{@render task_tree(task)}
	{:else}
		<i>No pending tasks.</i>
	{/each}
	<h4>Completed</h4>
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
		border-radius: 1em;
		padding: 1em;
		padding-top: 0;
		border: 1px solid #334;
		background-color: #232325;
	}

	.task-list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.task :global(.popover-toggle) {
		visibility: hidden;
	}

	.task:hover :global(.popover-toggle) {
		visibility: visible;
	}
</style>
