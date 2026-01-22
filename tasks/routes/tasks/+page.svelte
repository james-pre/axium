<script lang="ts">
	import { FormDialog, Icon } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import { TaskListInit } from '@axium/tasks/common';
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();

	let lists = $state(data.lists);
	let dialog = $state<HTMLDialogElement>();
</script>

<svelte:head>
	<title>Tasks</title>
</svelte:head>

<div id="tasks-main">
	<h1>Tasks</h1>

	<button id="create-task-list" class="icon-text mobile-float-right" onclick={() => dialog!.showModal()}>
		<Icon i="plus" /> New List
	</button>

	<div class="lists-container">
		{#each lists as list}
			<TaskList {list} bind:lists />
		{/each}
	</div>
</div>

<FormDialog
	bind:dialog
	submitText="Create List"
	submit={async rawInit => {
		const init = TaskListInit.parse(rawInit);
		const result = await fetchAPI('PUT', 'users/:id/task_lists', init, data.session!.userId);
		lists.push(Object.assign(result, { tasks: [] }));
	}}
>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required />
	</div>
	<div>
		<label for="description">Description <span class="subtle">(optional)</span></label>
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
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 1em;
	}

	@media (width < 700px) {
		#tasks-main {
			padding: 1em;
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
