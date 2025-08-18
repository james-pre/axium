<script lang="ts">
	import { fetchAPI } from '@axium/client/requests';
	import { FormDialog, Icon } from '@axium/client/components';
	import { parseNote } from '@axium/notes/client';
	import { NoteInit } from '@axium/notes/common';
	import { Note } from '@axium/notes/components';

	const { data } = $props();

	let notes = $state(data.notes);
	let dialog = $state<HTMLDialogElement>();
</script>

<svelte:head>
	<title>Notes</title>
</svelte:head>

<div class="notes-main">
	<h1>Notes</h1>
	<span>
		<button class="icon-text" onclick={() => dialog!.showModal()}>
			<Icon i="plus" /> New Note
		</button>
	</span>
	<div class="lists-container">
		{#each notes as note}
			<Note {note} bind:notes />
		{/each}
	</div>
</div>

<FormDialog
	bind:dialog
	submitText="Create Note"
	submit={async rawInit => {
		const init = NoteInit.parse(rawInit);
		const result = await fetchAPI('PUT', 'users/:id/notes', init, data.session.userId);
		parseNote(result);
		notes.push(result);
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
	.notes-main {
		padding: 2em;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.lists-container {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 1em;
	}
</style>
