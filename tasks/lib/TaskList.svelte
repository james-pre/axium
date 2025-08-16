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
	<div class="task">
		<label for="task-completed#{root.id}" style:cursor="pointer">
			<Icon i="regular/circle{root.completed ? '-check' : ''}" --size="20px" />
		</label>
		<input
			type="checkbox"
			name="completed"
			bind:checked={root.completed}
			id="task-completed#{root.id}"
			style:display="none"
			onchange={e => {
				root.completed = e.currentTarget.checked;
				fetchAPI('PATCH', 'tasks/:id', { completed: root.completed }, root.id);
			}}
		/>
		<input
			type="text"
			name="summary"
			class="editable-text"
			bind:value={root.summary}
			onchange={e => {
				root.summary = e.currentTarget.value;
				fetchAPI('PATCH', 'tasks/:id', { summary: root.summary }, root.id);
			}}
		/>
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
	</div>
	{#each tasks.filter(task => task.parentId == root.id) as child}
		{@render task_tree(child)}
	{/each}
{/snippet}

<div class="task-list">
	<div class="task-list-header">
		<input
			type="text"
			bind:value={list.name}
			class="editable-text"
			onblur={e => {
				list.name = e.currentTarget.value;
				fetchAPI('PATCH', 'task_lists/:id', { name: list.name }, list.id);
			}}
		/>
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
	.editable-text {
		background: none;
		border: none;
	}

	.task {
		display: grid;
		grid-template-columns: 1em 1fr 2em;
		align-items: center;
		gap: 1em;

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
		border: 1px solid #334;
		background-color: #232325;
	}

	.task-list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;

		input {
			font-size: 1.5em;
			font-weight: bold;
			padding: 0;
		}
	}

	.task :global(.popover-toggle) {
		visibility: hidden;
	}

	.task:hover :global(.popover-toggle) {
		visibility: visible;
	}
</style>
