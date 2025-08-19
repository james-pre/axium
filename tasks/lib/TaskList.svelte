<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { copy } from '@axium/client/clipboard';
	import { Icon, Popover } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import type { Task, TaskList } from '@axium/tasks/common';
	import type { WithRequired } from 'utilium';
	import { download } from 'utilium/dom.js';
	import TaskTree from './TaskTree.svelte';

	let { list = $bindable(), lists = $bindable() }: { list: WithRequired<TaskList, 'tasks'>; lists?: WithRequired<TaskList, 'tasks'>[] } =
		$props();

	let tasks = $state(list.tasks);

	function exportTask(task: Task): string {
		const children = tasks
			.filter(t => t.parentId === task.id)
			.map(exportTask)
			.map(str => '\t' + str)
			.join('\n');

		return `[${task.completed ? 'x' : ' '}] ${task.summary}` + children;
	}

	const rootPending = $derived(tasks.filter(task => !task.parentId && !task.completed));
	const rootCompleted = $derived(tasks.filter(task => !task.parentId && task.completed));
</script>

<div class="task-list">
	<div class="task-list-header">
		<input
			type="text"
			bind:value={list.name}
			class="editable-text"
			onchange={e => {
				list.name = e.currentTarget.value;
				fetchAPI('PATCH', 'task_lists/:id', { name: list.name }, list.id);
			}}
		/>
		<Popover>
			<div
				class="menu-item"
				onclick={() =>
					fetchAPI('DELETE', 'task_lists/:id', {}, list.id).then(() => {
						if (!lists) goto('/tasks');
						else lists.splice(lists.indexOf(list), 1);
					})}
			>
				<Icon i="trash" /> Delete
			</div>
			<div
				class="menu-item"
				onclick={() =>
					download(
						list.name + '.txt',
						list.tasks
							.filter(task => !task.parentId)
							.map(exportTask)
							.join('\n')
					)}
			>
				<Icon i="regular/file-export" /> Export
			</div>
			{#if tasks.some(t => !t.completed)}
				<div
					class="menu-item"
					onclick={() => {
						for (const task of tasks) task.completed = true;
						fetchAPI('POST', 'task_lists/:id', { all_completed: true }, list.id);
					}}
				>
					<Icon i="regular/circle-check" /> Complete All
				</div>
			{/if}
			{#if tasks.some(t => t.completed)}
				<div
					class="menu-item"
					onclick={() => {
						for (const task of tasks) task.completed = false;
						fetchAPI('POST', 'task_lists/:id', { all_completed: false }, list.id);
					}}
				>
					<Icon i="regular/circle" /> Un-complete All
				</div>
			{/if}
			<div class="menu-item" onclick={() => copy('text/plain', `${location.origin}/tasks/${list.id}`)}>
				<Icon i="link-horizontal" /> Copy Link
			</div>
			{#if lists}
				<div class="menu-item" onclick={() => open(`/tasks/${list.id}`)}>
					<Icon i="arrow-up-right-from-square" /> Open in New Tab
				</div>
			{/if}
			{#if page.data.session?.user.preferences.debug}
				<div class="menu-item" onclick={() => copy('text/plain', list.id)}>
					<Icon i="hashtag" --size="14px" /> Copy ID
				</div>
			{/if}
		</Popover>
	</div>
	<div>
		<button
			class="icon-text"
			onclick={() =>
				fetchAPI('PUT', 'task_lists/:id', { summary: '' }, list.id)
					.then(t => t)
					.then(tasks.push.bind(tasks))}
		>
			<Icon i="regular/circle-plus" /> Add Task
		</button>
	</div>
	<h4>Pending</h4>
	{#each rootPending as task, i (task.id)}
		<TaskTree bind:tasks bind:task={rootPending[i]} />
	{:else}
		<i class="subtle">No pending tasks.</i>
	{/each}
	<h4>Completed</h4>
	{#each rootCompleted as task, i (task.id)}
		<TaskTree bind:tasks bind:task={rootCompleted[i]} />
	{:else}
		<i class="subtle">No completed tasks.</i>
	{/each}
</div>

<style>
	.editable-text {
		background: none;
		border: none;
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		border-radius: 1em;
		padding: 1em;
		border: 1px solid var(--bg-accent);
		background-color: var(--bg-alt);
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
</style>
