<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchAPI } from '@axium/client/requests';
	import { Icon, Popover } from '@axium/client/components';
	import type { Note } from '@axium/notes/common';
	import { page } from '$app/state';
	import { copy } from '@axium/client/clipboard';

	let { note = $bindable(), notes = $bindable() }: { note: Note; notes?: Note[] } = $props();
</script>

<div class="note">
	<div class="note-header">
		<input
			type="text"
			bind:value={note.title}
			class="editable-text"
			onchange={e => {
				note.title = e.currentTarget.value;
				fetchAPI('PATCH', 'notes/:id', note, note.id);
			}}
		/>
		<Popover>
			<div
				class="menu-item"
				onclick={e => {
					e.stopPropagation();
					fetchAPI('DELETE', 'notes/:id', {}, note.id).then(() => {
						if (!notes) goto('/notes');
						else notes.splice(notes.indexOf(note), 1);
					});
				}}
			>
				<Icon i="trash" /> Delete
			</div>
			{#if notes}
				<div
					class="menu-item"
					onclick={e => {
						e.currentTarget.parentElement?.togglePopover();
						open(`/notes/${note.id}`);
					}}
				>
					<Icon i="arrow-up-right-from-square" /> Open in New Tab
				</div>
			{/if}
			{#if page.data.session?.user.preferences.debug}
				<div class="menu--item" onclick={() => copy('text/plain', note.id)}>
					<Icon i="copy" --size="14px" />
					Copy ID
				</div>
			{/if}
		</Popover>
	</div>
	<textarea
		name="content"
		class="editable-text"
		onchange={e => {
			note.content = e.currentTarget.value;
			fetchAPI('PATCH', 'notes/:id', note, note.id);
		}}>{note.content}</textarea
	>
</div>

<style>
	.editable-text {
		background: none;
		border: none;
	}

	.note {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		border-radius: 1em;
		padding: 1em;
		border: 1px solid var(--bg-accent);
		background-color: var(--bg-alt);
	}

	.note-header {
		display: flex;
		justify-content: space-between;
		align-items: center;

		input {
			font-size: 1.5em;
			font-weight: bold;
			padding: 0;
		}
	}

	.note :global(.popover-toggle) {
		visibility: hidden;
	}

	.note:hover :global(.popover-toggle) {
		visibility: visible;
	}
</style>
