<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fetchAPI, getAppPreferences, text } from '@axium/client';
	import { AccessControlDialog, Icon, Popover } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import { toastStatus } from '@axium/client/toast';
	import { buildTaskTree, type Task, type TaskList, type TaskTreeNode } from '@axium/tasks/common';
	import type { WithRequired } from 'utilium';
	import { download } from 'utilium/dom';

	let {
		list = $bindable(),
		lists = $bindable(),
	}: {
		list: WithRequired<TaskList, 'tasks'>;
		lists?: WithRequired<TaskList, 'tasks'>[];
	} = $props();

	const { user } = page.data.session;

	let tasks = $state(list.tasks),
		open = $state(false);

	const preferences = await getAppPreferences(user.id, 'tasks');
	const showCompletedInline = preferences.show_completed_subtasks == 'inline';

	const tree = $derived(buildTaskTree(tasks));

	const completed: TaskTreeNode[] = $derived(tree.filter(node => node.all == 'completed'));

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

{#snippet task_tree(node: TaskTreeNode, depth: number = 0, isCompletedMirror: boolean = false)}
	{@const task = node.task}
	<div class="task" style:margin-left="{depth * 1.75}em">
		{#if !showCompletedInline && isCompletedMirror != task.completed}
			<span class="mirror-marker">
				<Icon i="regular/circle{task.completed ? '-check' : ''}" --size="1.25em" />
			</span>
		{:else}
			<label for="task-completed#{task.id}" style:cursor="pointer">
				<Icon i="regular/circle{task.completed ? '-check' : ''}" --size="1.25em" />
			</label>
			<input
				type="checkbox"
				name="completed"
				bind:checked={task.completed}
				id="task-completed#{task.id}"
				style:display="none"
				oninput={e => {
					task.completed = e.currentTarget.checked;
					fetchAPI('PATCH', 'tasks/:id', { completed: task.completed }, task.id);
				}}
			/>
		{/if}
		<input
			type="text"
			name="summary"
			class="editable-text"
			bind:value={task.summary}
			oninput={e => {
				task.summary = e.currentTarget.value;
				fetchAPI('PATCH', 'tasks/:id', { summary: task.summary }, task.id);
			}}
		/>
		<Popover showToggle="hover">
			<div
				class="menu-item"
				onclick={() => {
					fetchAPI('PUT', 'task_lists/:id', { summary: '', parentId: task.id }, list.id).then(t => tasks.push(t));
				}}
			>
				<Icon i="arrow-turn-down-right" />
				<span>{text('tasks.add_subtask')}</span>
			</div>
			<div
				class="menu-item"
				onclick={() =>
					toastStatus(
						fetchAPI('DELETE', 'tasks/:id', {}, task.id).then(() => {
							tasks.splice(tasks.indexOf(task), 1);
						}),
						text('tasks.toast_task_deleted')
					)}
			>
				<Icon i="trash" />
				<span>{text('generic.delete')}</span>
			</div>
			{#if user.preferences.debug}
				<div class="menu-item" onclick={() => copy('text/plain', task.id)}>
					<Icon i="hashtag" --size="14px" />
					<span>{text('tasks.copy_id')}</span>
				</div>
			{/if}
		</Popover>
	</div>
	{#each node.children as sub (sub.task.id)}
		{#if sub.all != (isCompletedMirror ? 'pending' : 'completed')}
			{@render task_tree(sub, depth + 1, isCompletedMirror)}
		{/if}
	{/each}
	{@const completedSubs = node.children.filter(sub => sub.all == 'completed')}
	{#if showCompletedInline && completedSubs.length}
		{#snippet inside()}
			{#each completedSubs as sub (sub.task.id)}
				{@render task_tree(sub, depth + 1, isCompletedMirror)}
			{/each}
		{/snippet}
		{#if node.all == 'completed'}
			{@render inside()}
		{:else}
			<details>
				<summary style:margin-left="{depth * 1.75 + 1}em" class="completed-subtasks subtle"
					>{text('tasks.completed_heading', { count: completedSubs.length })}</summary
				>
				{@render inside()}
			</details>
		{/if}
	{/if}
{/snippet}

<div class="task-list">
	<div class="task-list-header">
		<input
			type="text"
			bind:value={list.name}
			class="editable-text"
			oninput={e => {
				list.name = e.currentTarget.value;
				fetchAPI('PATCH', 'task_lists/:id', { name: list.name }, list.id);
			}}
		/>
		<Popover>
			<div
				class="menu-item"
				onclick={() =>
					toastStatus(
						fetchAPI('DELETE', 'task_lists/:id', {}, list.id).then(() => {
							if (!lists) goto('/tasks');
							else lists.splice(lists.indexOf(list), 1);
						}),
						text('tasks.toast_list_deleted')
					)}
			>
				<Icon i="trash" />
				<span>{text('generic.delete')}</span>
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
				<Icon i="regular/file-export" />
				<span>{text('tasks.export_list')}</span>
			</div>
			<div
				class="menu-item"
				onclick={() => {
					acl!.showModal();
					acl!.click();
				}}
			>
				<Icon i="user-group" />
				<span>{text('tasks.share_list')}</span>
			</div>
			{#if tasks.some(t => !t.completed)}
				<div
					class="menu-item"
					onclick={() => {
						for (const task of tasks) task.completed = true;
						toastStatus(
							fetchAPI('POST', 'task_lists/:id', { all_completed: true }, list.id),
							text('tasks.toast_all_completed')
						);
					}}
				>
					<Icon i="regular/circle-check" />
					<span>{text('tasks.mark_all_complete')}</span>
				</div>
			{/if}
			{#if tasks.some(t => t.completed)}
				<div
					class="menu-item"
					onclick={() => {
						for (const task of tasks) task.completed = false;
						toastStatus(fetchAPI('POST', 'task_lists/:id', { all_completed: false }, list.id), text('tasks.toast_all_pending'));
					}}
				>
					<Icon i="regular/circle" />
					<span>{text('tasks.mark_all_pending')}</span>
				</div>
			{/if}
			<div class="menu-item" onclick={() => copy('text/plain', `${location.origin}/tasks/${list.id}`)}>
				<Icon i="link-horizontal" />
				<span>{text('tasks.copy_link')}</span>
			</div>
			{#if lists}
				<div class="menu-item" onclick={() => window.open(`/tasks/${list.id}`)}>
					<Icon i="arrow-up-right-from-square" />
					<span>{text('tasks.open_new_tab')}</span>
				</div>
			{/if}
			{#if user.preferences.debug}
				<div class="menu-item" onclick={() => copy('text/plain', list.id)}>
					<Icon i="hashtag" --size="14px" />
					<span>{text('tasks.copy_id')}</span>
				</div>
			{/if}
		</Popover>
		<AccessControlDialog bind:dialog={acl} item={list} itemType="task_lists" {user} />
	</div>
	<div>
		<button class="icon-text" onclick={() => fetchAPI('PUT', 'task_lists/:id', { summary: '' }, list.id).then(t => tasks.push(t))}>
			<Icon i="regular/circle-plus" />
			<span>{text('tasks.new_task')}</span>
		</button>
	</div>

	{#each tree.filter(node => node.all != 'completed') as node (node.task.id)}
		{@render task_tree(node)}
	{:else}
		<i class="subtle">{text('tasks.pending_empty')}</i>
	{/each}

	{#if completed.length || (!showCompletedInline && tasks.some(t => t.completed))}
		<details bind:open>
			<summary
				>{text('tasks.completed_heading', {
					count: (showCompletedInline ? completed : tasks.filter(t => t.completed)).length,
				})}</summary
			>
			{#if showCompletedInline}
				{#each completed as node (node.task.id)}
					{@render task_tree(node)}
				{/each}
			{:else}
				{#each tree.filter(node => node.all != 'pending') as node (node.task.id)}
					{@render task_tree(node, 0, true)}
				{/each}
			{/if}
		</details>
	{/if}
</div>

<style>
	.editable-text {
		background: none;
		border: none;
	}

	.task {
		display: grid;
		grid-template-columns: 1.25em 1fr 2em;
		align-items: center;
		gap: 0.5em;

		label,
		.mirror-marker {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.mirror-marker {
			opacity: 69%;
		}

		input {
			padding: 0.125em 0.25em;
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

	summary {
		margin-bottom: 0.5em;
	}

	summary:not(.completed-subtasks) {
		font-weight: bold;
	}
</style>
