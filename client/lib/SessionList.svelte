<script lang="ts">
	import { logout, logoutAll, text } from '@axium/client';
	import type { Session, User } from '@axium/core';
	import FormDialog from './FormDialog.svelte';
	import Icon from './Icon.svelte';

	let {
		sessions = $bindable(),
		currentSession,
		user,
		redirectAfterLogoutAll = false,
	}: { sessions: Session[]; currentSession?: Session; user: User; redirectAfterLogoutAll?: boolean } = $props();
</script>

{#each sessions as session}
	<div class="item session">
		<p>
			{session.name ?? `${session.id.slice(0, 4)}...${session.id.slice(-4)}`}
			{#if session.id == currentSession?.id}
				<span class="current">{text('component.SessionList.current')}</span>
			{/if}
			{#if session.elevated}
				<span class="elevated">{text('component.SessionList.elevated')}</span>
			{/if}
		</p>
		<p class="timestamp">{text('component.SessionList.created', { date: session.created.toLocaleString() })}</p>
		<p class="timestamp">{text('component.SessionList.expires', { date: session.expires.toLocaleString() })}</p>
		<button command="show-modal" commandfor={'logout-session:' + session.id} class="logout icon-text">
			<Icon i="right-from-bracket" --size="16px" />
			<span class="mobile-only">{text('generic.logout')}</span>
		</button>
	</div>
	<FormDialog
		id={'logout-session:' + session.id}
		submit={async () => {
			await logout(user.id, session.id);
			sessions.splice(sessions.indexOf(session), 1);
			if (session.id == currentSession?.id) window.location.href = '/';
		}}
		submitText={text('generic.logout')}
	>
		<p>{text('component.SessionList.logout_single')}</p>
	</FormDialog>
{/each}
<button command="show-modal" commandfor="logout-all" class="danger inline-button">{text('component.SessionList.logout_all_trigger')}</button
>
<FormDialog
	id="logout-all"
	submit={() => logoutAll(user.id).then(() => (redirectAfterLogoutAll ? (window.location.href = '/') : null))}
	submitText={text('component.SessionList.logout_all_submit')}
	submitDanger
>
	<p>{text('component.SessionList.logout_all_question')}</p>
</FormDialog>

<style>
	button.logout {
		width: fit-content;
		text-align: center;
	}
</style>
