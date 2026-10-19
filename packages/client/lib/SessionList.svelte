<script lang="ts">
	import { logout, logoutAll, text, updateSession } from '@axium/client';
	import type { Session, User } from '@axium/core';
	import { SessionChangeable } from '@axium/core/user';
	import FormDialog from './FormDialog.svelte';
	import Icon from './Icon.svelte';
	import InlineEdit from './InlineEdit.svelte';
	import { toastStatus } from './toast.js';

	let {
		sessions = $bindable(),
		currentSession,
		user,
		redirectAfterLogoutAll = false,
	}: { sessions: Session[]; currentSession?: Session; user: User; redirectAfterLogoutAll?: boolean } = $props();

	let editing = $state<string>();
</script>

{#each sessions as session}
	<div class="item session">
		{#if editing == session.id}
			<InlineEdit
				value={session.name}
				schema={SessionChangeable.shape.name}
				placeholder={text('SessionList.rename_placeholder')}
				commit={name =>
					toastStatus(
						updateSession(user.id, { id: session.id, name }).then(updated => {
							sessions = sessions.map(s => (s.id == updated.id ? updated : s));
						}),
						text('SessionList.toast_renamed')
					)}
				close={() => (editing = undefined)}
			/>
		{:else}
			<p>
				{session.name || `${session.id.slice(0, 4)}...${session.id.slice(-4)}`}
				{#if session.id == currentSession?.id}
					<span class="current">{text('SessionList.current')}</span>
				{/if}
				{#if session.elevated}
					<span class="elevated">{text('SessionList.elevated')}</span>
				{/if}
			</p>
		{/if}
		<p class="timestamp">{text('SessionList.created', { date: session.created.toLocaleString() })}</p>
		<p class="timestamp">{text('SessionList.expires', { date: session.expires.toLocaleString() })}</p>
		<button onclick={() => (editing = session.id)} class="rename icon-text">
			<Icon i="pen" --size="16px" />
			<span class="mobile-only">{text('generic.rename')}</span>
		</button>
		<button command="show-modal" commandfor={'logout-session:' + session.id} class="logout icon-text">
			<Icon i="right-from-bracket" --size="16px" />
			<span class="mobile-only">{text('generic.logout')}</span>
		</button>
	</div>
	<FormDialog
		id={'logout-session:' + session.id}
		submit={async () => {
			await logout(user.id, session.id);
			sessions = sessions.filter(s => s.id != session.id);
			if (session.id == currentSession?.id) window.location.href = '/';
		}}
		submitText={text('generic.logout')}
	>
		<p>{text('SessionList.logout_single')}</p>
	</FormDialog>
{/each}
<button command="show-modal" commandfor="logout-all" class="danger inline-button">{text('SessionList.logout_all_trigger')}</button>
<FormDialog
	id="logout-all"
	submit={() => logoutAll(user.id).then(() => (redirectAfterLogoutAll ? (window.location.href = '/') : null))}
	submitText={text('SessionList.logout_all_submit')}
	submitDanger
>
	<p>{text('SessionList.logout_all_question')}</p>
</FormDialog>

<style>
	button:is(.logout, .rename) {
		width: fit-content;
		text-align: center;
	}
</style>
