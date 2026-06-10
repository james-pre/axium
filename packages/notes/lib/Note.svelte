<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fetchAPI, text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';
	import { AccessControlDialog, Icon, Popover } from '@axium/client/components';
	import { copy } from '@axium/client/gui';
	import { toastStatus } from '@axium/client/toast';
	import { checkAndMatchACL, type UserPublic } from '@axium/core';
	import type { Note } from '@axium/notes/common';
	import { download } from 'utilium/dom';

	let {
		note = $bindable(),
		notes = $bindable(),
		pageMode = false,
		user,
	}: { note: Note; notes?: Note[]; pageMode?: boolean; user?: UserPublic } = $props();

	const canEdit = user && (user.id === note.userId || !checkAndMatchACL(note.acl, user, { edit: true }).size);
	const canManage = user && (user.id === note.userId || !checkAndMatchACL(note.acl, user, { manage: true }).size);
</script>

<div class={['note', pageMode && 'full-page']}>
	<div class="note-header">
		{#if note.pinned}
			<div class="pin"><Icon i="thumbtack" /></div>
		{/if}
		{#if canEdit}
			<input
				type="text"
				bind:value={note.title}
				placeholder="Unnamed Note"
				class="note-title"
				oninput={e => {
					note.title = e.currentTarget.value;
					fetchAPI('PATCH', 'notes/:id', note, note.id);
				}}
			/>
		{:else}
			<span class="note-title">{note.title}</span>
		{/if}
		<Popover showToggle="hover">
			{#if canEdit}
				<div
					class="menu-item"
					onclick={() => {
						note.pinned = !note.pinned;
						fetchAPI('PATCH', 'notes/:id', note, note.id);
					}}
				>
					<Icon i="thumbtack{note.pinned ? '-slash' : ''}" />
					<span>{note.pinned ? text('notes.unpin') : text('notes.pin')}</span>
				</div>
			{/if}
			{#if canManage}
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
			{/if}
			<div class="menu-item" onclick={() => download(note.title + '.txt', note.content ?? '')}>
				<Icon i="download" />
				<span>{text('notes.download')}</span>
			</div>
			<button class="reset menu-item" command="show-modal" commandfor="acl#{note.id}">
				<Icon i="user-group" />
				<span>{text('notes.share')}</span>
			</button>
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
		<AccessControlDialog item={note} itemType="notes" {user} id="acl#{note.id}" />
	</div>
	{#if canEdit}
		<textarea
			bind:value={note.content}
			name="content"
			class="note-content"
			placeholder={text('notes.content_placeholder')}
			oninput={() => fetchAPI('PATCH', 'notes/:id', note, note.id)}
			{@attach dynamicRows()}>{note.content}</textarea
		>
	{:else}
		<div class="note-content">
			{#if note.content}
				<span>{note.content}</span>
			{:else}
				<i class="subtle">{text('notes.content_missing')}</i>
			{/if}
		</div>
	{/if}
</div>

<style>
	.note-title,
	.note-content {
		background: none;
		border: none;
	}

	div.note-content i.subtle {
		font-size: inherit;
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
	}

	.note.full-page {
		max-height: unset;
		height: 100%;
	}

	.note-header {
		display: flex;
		justify-content: space-between;
		align-items: center;

		.pin {
			flex: 0 0 auto;
		}

		.note-title {
			font-size: 1.5em;
			font-weight: bold;
			padding: 0;
		}
	}
</style>
