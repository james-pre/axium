<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchAPI } from '@axium/client/requests';
	import { AccessControlDialog, Icon, Popover } from '@axium/client/components';
	import type { Note } from '@axium/notes/common';
	import { page } from '$app/state';
	import { copy } from '@axium/client/clipboard';
	import { download } from 'utilium/dom.js';

	let { note = $bindable(), notes = $bindable(), pageMode = false }: { note: Note; notes?: Note[]; pageMode?: boolean } = $props();

	let acl = $state<HTMLDialogElement>();
</script>

<div class={['note', pageMode && 'full-page']}>
	<div class="note-header">
		<input
			type="text"
			bind:value={note.title}
			placeholder="Unnamed Note"
			class="editable-text"
			onchange={e => {
				note.title = e.currentTarget.value;
				fetchAPI('PATCH', 'notes/:id', note, note.id);
			}}
		/>
		<Popover showToggle="hover">
			<div
				class="menu-item"
				onclick={() =>
					fetchAPI('DELETE', 'notes/:id', {}, note.id).then(() => {
						if (!notes) goto('/notes');
						else notes.splice(notes.indexOf(note), 1);
					})}
			>
				<Icon i="trash" /> Delete
			</div>
			<div class="menu-item" onclick={() => download(note.title + '.txt', note.content ?? '')}>
				<Icon i="download" /> Download
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
			<div class="menu-item" onclick={() => copy('text/plain', `${location.origin}/notes/${note.id}`)}>
				<Icon i="link-horizontal" /> Copy Link
			</div>
			{#if notes}
				<div class="menu-item" onclick={() => open(`/notes/${note.id}`)}>
					<Icon i="arrow-up-right-from-square" /> Open in New Tab
				</div>
			{/if}
			{#if page.data.session?.user.preferences.debug}
				<div class="menu-item" onclick={() => copy('text/plain', note.id)}>
					<Icon i="hashtag" --size="14px" />
					Copy ID
				</div>
			{/if}
		</Popover>
		<AccessControlDialog bind:dialog={acl} bind:item={note} itemType="notes" editable />
	</div>
	<textarea
		name="content"
		class="editable-text"
		placeholder="It's a beautiful day outside..."
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
		height: fit-content;
		max-height: 40em;
		anchor-name: --note;

		textarea {
			resize: none;
			field-sizing: content;
			height: max-content;
		}
	}

	.note.full-page {
		max-height: unset;
		height: 100%;
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
</style>
