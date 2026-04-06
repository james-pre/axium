<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { Note } from '@axium/notes/components';

	const { data } = $props();

	let notes = $state(data.notes);
</script>

<svelte:head>
	<title>{text('app_name.notes')}</title>
</svelte:head>

<div id="notes-main">
	<h1>{text('app_name.notes')}</h1>
	<button
		id="create-note"
		class="icon-text mobile-float-right"
		onclick={async () => {
			try {
				const result = await fetchAPI('PUT', 'users/:id/notes', { title: '' }, data.session.userId);
				notes.push(result);
			} catch (e) {
				toast('error', e);
			}
		}}
	>
		<Icon i="plus" />
		<span>{text('notes.new')}</span>
	</button>
	<div class="lists-container">
		{#each notes as note}
			<Note {note} bind:notes user={data.session?.user} />
		{/each}
	</div>
</div>

<style>
	#notes-main {
		padding: 2em;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.lists-container {
		display: grid;
		display: grid-lanes;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 1em;
	}

	#create-note {
		width: fit-content;
	}

	@media (width < 700px) {
		#notes-main {
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
