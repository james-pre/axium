<script lang="ts">
	import { fetchAPI } from '@axium/client/requests';
	import type { Task } from '@axium/tasks/common';
	import { Icon, Popover } from '@axium/client/components';
	import { page } from '$app/state';
	import { copy } from '@axium/client/clipboard';
	import TaskTree from './TaskTree.svelte';

	let { task = $bindable(), tasks = $bindable() }: { task: Task; tasks: Task[] } = $props();

	const children = $derived(tasks.filter(task => task.parentId == task.id));
</script>

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
	<Popover>
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

{#each children as task, i (task.id)}
	<TaskTree bind:tasks bind:task={children[i]} />
{/each}

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

	.task :global(.popover-toggle) {
		visibility: hidden;
	}

	.task:hover :global(.popover-toggle) {
		visibility: visible;
	}
</style>
