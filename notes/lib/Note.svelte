<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fetchAPI, text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';
	import { AccessControlDialog, Icon, Popover } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import { toastStatus } from '@axium/client/toast';
	import type { Note } from '@axium/notes/common';
	import { download } from 'utilium/dom.js';

	let {
		note = $bindable(),
		notes = $bindable(),
		pageMode = false,
		user,
	}: { note: Note; notes?: Note[]; pageMode?: boolean; user?: UserPublic } = $props();

	let acl = $state<HTMLDialogElement>();
</script>

<div class={['note', pageMode && 'full-page']}>
	<div class="note-header">
		<input
			type="text"
			bind:value={note.title}
			placeholder="Unnamed Note"
			class="editable-text"
			oninput={e => {
				note.title = e.currentTarget.value;
				fetchAPI('PATCH', 'notes/:id', note, note.id);
			}}
		/>
		<Popover showToggle="hover">
			<div
				class="menu-item"
				onclick={() =>
					toastStatus(
						fetchAPI('DELETE', 'notes/:id', {}, note.id).then(() => {
							if (!notes) goto('/notes');
							else notes.splice(notes.indexOf(note), 1);
						}),
						text('notes.toast_deleted')
					)}
			>
				<Icon i="trash" />
				<span>{text('generic.delete')}</span>
			</div>
			<div class="menu-item" onclick={() => download(note.title + '.txt', note.content ?? '')}>
				<Icon i="download" />
				<span>{text('notes.download')}</span>
			</div>
			<div
				class="menu-item"
				onclick={() => {
					acl!.showModal();
					acl!.click();
				}}
			>
				<Icon i="user-group" />
				<span>{text('notes.share')}</span>
			</div>
			<div class="menu-item" onclick={() => copy('text/plain', `${location.origin}/notes/${note.id}`)}>
				<Icon i="link-horizontal" />
				<span>{text('notes.copy_link')}</span>
			</div>
			{#if notes}
				<div class="menu-item" onclick={() => open(`/notes/${note.id}`)}>
					<Icon i="arrow-up-right-from-square" />
					<span>{text('notes.open_new_tab')}</span>
				</div>
			{/if}
			{#if page.data.session?.user.preferences.debug}
				<div class="menu-item" onclick={() => copy('text/plain', note.id)}>
					<Icon i="hashtag" --size="14px" />
					<span>{text('notes.copy_id')}</span>
				</div>
			{/if}
		</Popover>
		<AccessControlDialog bind:dialog={acl} item={note} itemType="notes" editable />
	</div>
	<textarea
		bind:value={note.content}
		name="content"
		class="editable-text"
		placeholder={text('notes.content_placeholder')}
		oninput={() => fetchAPI('PATCH', 'notes/:id', note, note.id)}
		{@attach dynamicRows()}>{note.content}</textarea
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
			overflow-y: scroll;
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
