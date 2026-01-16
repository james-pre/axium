<script lang="ts">
	import { logout, logoutAll } from '@axium/client/user';
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
			{session.id.slice(0, 4)}...{session.id.slice(-4)}
			{#if session.id == currentSession?.id}
				<span class="current">Current</span>
			{/if}
			{#if session.elevated}
				<span class="elevated">Elevated</span>
			{/if}
		</p>
		<p class="timestamp">Created {session.created.toLocaleString()}</p>
		<p class="timestamp">Expires {session.expires.toLocaleString()}</p>
		<button command="show-modal" commandfor={'logout-session:' + session.id} class="logout icon-text">
			<Icon i="right-from-bracket" --size="16px" />
			<span class="mobile-only">Logout</span>
		</button>
	</div>
	<FormDialog
		id={'logout-session:' + session.id}
		submit={async () => {
			await logout(user.id, session.id);
			sessions.splice(sessions.indexOf(session), 1);
			if (session.id == currentSession?.id) window.location.href = '/';
		}}
		submitText="Logout"
	>
		<p>Are you sure you want to log out this session?</p>
	</FormDialog>
{/each}
<button command="show-modal" commandfor="logout-all" class="danger inline-button">Logout All</button>
<FormDialog
	id="logout-all"
	submit={() => logoutAll(user.id).then(() => (redirectAfterLogoutAll ? (window.location.href = '/') : null))}
	submitText="Logout All Sessions"
	submitDanger
>
	<p>Are you sure you want to log out all sessions?</p>
</FormDialog>
