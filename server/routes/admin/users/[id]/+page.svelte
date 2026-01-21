<script lang="ts">
	import { ClipboardCopy, Preferences, SessionList, Icon } from '@axium/client/components';
	import '@axium/client/styles/account';
	import { formatDateRange } from '@axium/core/format';

	const { data } = $props();
	const { user } = data;

	let sessions = $state(user.sessions);
</script>

<svelte:head>
	<title>Admin — User Management</title>
</svelte:head>

<a href="/admin/users">
	<button class="icon-text">
		<Icon i="up-left" /> Back to all users
	</button>
</a>

<h2>User Management</h2>

<div id="info" class="section main">
	<div class="item info">
		<p>UUID</p>
		<p>{user.id}</p>
		<ClipboardCopy value={user.id} --size="16px" />
	</div>

	<div class="item info">
		<p>Display Name</p>
		<p>{user.name}</p>
		<ClipboardCopy value={user.name} --size="16px" />
	</div>

	<div class="item info">
		<p>Email</p>
		<p>
			<a href="mailto:{user.email}">{user.email}</a>, {user.emailVerified
				? 'verified ' + user.emailVerified.toLocaleString()
				: 'not verified'}
		</p>
		<ClipboardCopy value={user.email} --size="16px" />
	</div>

	<div class="item info">
		<p>Registered</p>
		<p>{formatDateRange(user.registeredAt)}</p>
		<ClipboardCopy value={user.registeredAt.toISOString()} --size="16px" />
	</div>
	<div class="item info">
		<p>Administrator</p>
		{#if user.isAdmin}
			<strong>Yes</strong>
		{:else}
			<p>No</p>
		{/if}
		<p></p>
	</div>
	<div class="item info">
		<p>Suspended</p>
		{#if user.isSuspended}
			<strong>Yes</strong>
		{:else}
			<p>No</p>
		{/if}
		<button>{user.isSuspended ? 'Unsuspend' : 'Suspend'}</button>
	</div>
	<div class="item info">
		<p>Profile Image</p>
		{#if user.image}
			<a href={user.image} target="_blank" rel="noopener noreferrer">{user.image}</a>
			<ClipboardCopy value={user.image} --size="16px" />
		{:else}
			<i>Default</i>
			<p></p>
		{/if}
	</div>
	<div class="item info">
		<p>Roles</p>
		<p>{user.roles.join(', ')}</p>
	</div>
	<div class="item info">
		<p>Tags</p>
		<p>{user.tags.join(', ')}</p>
	</div>
</div>

<div id="sessions" class="section main">
	<h3>Sessions</h3>
	<SessionList {sessions} {user} />
</div>

<div id="preferences" class="section main">
	<h3>Preferences</h3>
	<Preferences userId={user.id} bind:preferences={user.preferences} />
</div>

<style>
	div.info {
		grid-template-columns: 10em 1fr 6em;
	}

	.section {
		margin-bottom: 2em;
	}
</style>
