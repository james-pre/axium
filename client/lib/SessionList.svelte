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

	const dialogs = $state<Record<string, HTMLDialogElement>>({});
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
		<p>Created {session.created.toLocaleString()}</p>
		<p>Expires {session.expires.toLocaleString()}</p>
		<button style:display="contents" onclick={() => dialogs['logout#' + session.id].showModal()}>
			<Icon i="right-from-bracket" --size="16px" />
		</button>
	</div>
	<FormDialog
		bind:dialog={dialogs['logout#' + session.id]}
		submit={async () => {
			await logout(user.id, session.id);
			dialogs['logout#' + session.id].remove();
			sessions.splice(sessions.indexOf(session), 1);
			if (session.id == currentSession?.id) window.location.href = '/';
		}}
		submitText="Logout"
	>
		<p>Are you sure you want to log out this session?</p>
	</FormDialog>
{/each}
<span>
	<button onclick={() => dialogs.logout_all.showModal()} class="danger">Logout All</button>
</span>
<FormDialog
	bind:dialog={dialogs.logout_all}
	submit={() => logoutAll(user.id).then(() => (redirectAfterLogoutAll ? (window.location.href = '/') : null))}
	submitText="Logout All Sessions"
	submitDanger
>
	<p>Are you sure you want to log out all sessions?</p>
</FormDialog>
