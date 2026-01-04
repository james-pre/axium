<script lang="ts">
	import { Icon } from '@axium/client/components';
	import { Note } from '@axium/notes/components';

	const { data } = $props();

	let opener = $state.raw<Window | null>(window.opener);

	opener?.addEventListener('beforeunload', () => (opener = null));
	opener?.addEventListener('load', () => (opener = null));
	opener?.addEventListener('popstate', () => {
		opener = opener?.location.pathname == '/notes' ? window.opener : null;
	});
</script>

<svelte:head>
	<title>Notes — {data.note.title}</title>
</svelte:head>

<div class="note-container">
	{#if opener}
		<div>
			<button
				class="icon-text"
				onclick={() => {
					opener?.focus();
					close();
				}}
			>
				<Icon i="arrow-left-from-bracket" /> Back to Notes
			</button>
		</div>
	{/if}

	<Note note={data.note} pageMode />
</div>

<style>
	.note-container {
		display: flex;
		flex-direction: column;
		gap: 1em;
		padding: 1em;
		inset: 1em;
	}

	:global(.note-header [popover]) {
		right: 1em;
	}
</style>
