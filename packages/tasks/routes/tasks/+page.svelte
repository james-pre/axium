<script lang="ts">
	import { FormDialog, Icon, AppPreferencesDialog } from '@axium/client/components';
	import { fetchAPI, text } from '@axium/client';
	import { TaskListInit, TasksPreferences } from '@axium/tasks/common';
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();

	let lists = $state(data.lists);
	let dialog = $state<HTMLDialogElement>();
</script>

<svelte:head>
	<title>{text('app_name.tasks')}</title>
</svelte:head>

<div id="tasks-main">
	<h1>{text('app_name.tasks')}</h1>

	<div>
		<AppPreferencesDialog appId="tasks" userId={data.session.userId} schema={TasksPreferences} />

		<button id="create-task-list" class="icon-text mobile-float-right" onclick={() => dialog!.showModal()}>
			<Icon i="plus" />
			<span>{text('tasks.new_list')}</span>
		</button>
	</div>

	<div class="lists-container">
		{#each lists as list}
			<TaskList {list} bind:lists />
		{/each}
	</div>
</div>

<FormDialog
	bind:dialog
	submitText={text('tasks.list_init.submit')}
	submit={async rawInit => {
		const init = TaskListInit.parse(rawInit);
		const result = await fetchAPI('PUT', 'users/:id/task_lists', init, data.session!.userId);
		lists.push(Object.assign(result, { tasks: [] }));
	}}
>
	<div>
		<label for="name">{text('tasks.list_init.name')}</label>
		<input name="name" type="text" required />
	</div>
	<div>
		<label for="description">{@html text('tasks.list_init.description', { $html: true })}</label>
		<input name="description" type="text" />
	</div>
</FormDialog>

<style>
	#tasks-main {
		padding: 2em;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	#create-task-list {
		width: fit-content;
	}

	.lists-container {
		display: grid;
		display: grid-lanes;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 1em;
	}

	@media (width < 700px) {
		#tasks-main {
			padding: 1em;
			padding-bottom: 5em;
			align-content: center;
		}

		.lists-container {
			display: flex;
			flex-direction: column;
			gap: 1em;
			align-content: center;
		}
	}
</style>
