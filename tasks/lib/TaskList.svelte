<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { copy } from '@axium/client/clipboard';
	import { AccessControlDialog, Icon, Popover } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import type { Task, TaskList } from '@axium/tasks/common';
	import type { WithRequired } from 'utilium';
	import { download } from 'utilium/dom.js';

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

	let acl = $state<HTMLDialogElement>();
</script>

{#snippet task_tree(task: Task)}
	<div class="task">
		<label for="task-completed#{task.id}" style:cursor="pointer">
			<Icon i="regular/circle{task.completed ? '-check' : ''}" --size="20px" />
		</label>
		<input
			type="checkbox"
			name="completed"
			bind:checked={task.completed}
			id="task-completed#{task.id}"
			style:display="none"
			onchange={e => {
				task.completed = e.currentTarget.checked;
				fetchAPI('PATCH', 'tasks/:id', { completed: task.completed }, task.id);
			}}
		/>
		<input
			type="text"
			name="summary"
			class="editable-text"
			bind:value={task.summary}
			onchange={e => {
				task.summary = e.currentTarget.value;
				fetchAPI('PATCH', 'tasks/:id', { summary: task.summary }, task.id);
			}}
		/>
		<Popover showToggle="hover">
			<div
				class="menu-item"
				onclick={() =>
					fetchAPI('DELETE', 'tasks/:id', {}, task.id).then(() => {
						tasks.splice(tasks.indexOf(task), 1);
					})}
			>
				<Icon i="trash" /> Delete
			</div>
			{#if page.data.session?.user.preferences.debug}
				<div class="menu-item" onclick={() => copy('text/plain', task.id)}>
					<Icon i="hashtag" --size="14px" /> Copy ID
				</div>
			{/if}
		</Popover>
	</div>

	{#each tasks.filter(task => task.parentId == task.id) as task (task.id)}
		{@render task_tree(task)}
	{/each}
{/snippet}

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
			<div
				class="menu-item"
				onclick={() => {
					acl!.showModal();
					acl!.click();
				}}
			>
				<Icon i="user-group" /> Share
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
		<AccessControlDialog bind:dialog={acl} item={list} itemType="task_lists" editable />
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
	{#each tasks.filter(task => !task.parentId && !task.completed) as task (task.id)}
		{@render task_tree(task)}
	{:else}
		<i class="subtle">No pending tasks.</i>
	{/each}
	<h4>Completed</h4>
	{#each tasks.filter(task => !task.parentId && task.completed) as task (task.id)}
		{@render task_tree(task)}
	{:else}
		<i class="subtle">No completed tasks.</i>
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
