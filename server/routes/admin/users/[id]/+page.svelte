<script lang="ts">
	import { text } from '@axium/client';
	import { ClipboardCopy, FormDialog, Icon, SessionList, ZodForm, ZodInput } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import '@axium/client/styles/account';
	import { deleteUser } from '@axium/client/user';
	import { preferenceLabels, Preferences, User } from '@axium/core';
	import { formatDateRange } from '@axium/core/format';

	const { data } = $props();
	let user = $state(data.user);
	const { session } = data;

	let sessions = $state(user.sessions);

	async function updateValue(val: User) {
		const result = await fetchAPI('PATCH', 'admin/users', val);
		Object.assign(user, result);
	}
</script>

<svelte:head>
	<title>{text('page.admin.users.manage_title')}</title>
</svelte:head>

<a href="/admin/users">
	<button class="icon-text">
		<Icon i="up-left" />
		{text('page.admin.users.back')}
	</button>
</a>

<h2>{text('page.admin.users.manage_heading')}</h2>

<div id="info" class="section main">
	<div class="item info">
		<p>{text('page.admin.users.uuid')}</p>
		<p>{user.id}</p>
		<ClipboardCopy value={user.id} --size="16px" />
	</div>

	<div class="item info">
		<p>{text('page.admin.users.display_name')}</p>
		<p>{user.name}</p>
		<ClipboardCopy value={user.name} --size="16px" />
	</div>

	<div class="item info">
		<p>{text('generic.email')}</p>
		<p>
			<a href="mailto:{user.email}">{user.email}</a>, {user.emailVerified
				? text('page.admin.users.email_verified', { date: user.emailVerified.toLocaleString() })
				: text('page.admin.users.email_not_verified')}
		</p>
		<ClipboardCopy value={user.email} --size="16px" />
	</div>

	<div class="item info">
		<p>{text('page.admin.users.registered')}</p>
		<p>{formatDateRange(user.registeredAt)}</p>
		<ClipboardCopy value={user.registeredAt.toISOString()} --size="16px" />
	</div>
	<div class="item info">
		<p>{text('page.admin.users.administrator')}</p>
		{#if user.isAdmin}
			<strong>{text('generic.yes')}</strong>
		{:else}
			<p>{text('generic.no')}</p>
		{/if}
		<p></p>
	</div>
	<div class="item info">
		<p>{text('page.admin.users.suspended')}</p>
		{#if user.isSuspended}
			<strong>{text('generic.yes')}</strong>
		{:else}
			<p>{text('generic.no')}</p>
		{/if}
		<button
			onclick={async () => {
				const { isSuspended } = await fetchAPI('PATCH', 'admin/users', { isSuspended: !user.isSuspended, id: user.id });
				user.isSuspended = isSuspended;
			}}>{user.isSuspended ? text('page.admin.users.unsuspend') : text('page.admin.users.suspend')}</button
		>
	</div>
	<div class="item info">
		<p>{text('page.admin.users.profile_image')}</p>
		{#if user.image}
			<a href={user.image} target="_blank" rel="noopener noreferrer">{user.image}</a>
			<ClipboardCopy value={user.image} --size="16px" />
		{:else}
			<i>{text('page.admin.users.default_image')}</i>
			<p></p>
		{/if}
	</div>
	<div class="item info">
		<p>{text('page.admin.users.roles')}</p>
		<ZodInput bind:rootValue={user} path="roles" schema={User.shape.roles} {updateValue} noLabel />
	</div>
	<div class="item info">
		<p>{text('page.admin.users.tags')}</p>
		<ZodInput bind:rootValue={user} path="tags" schema={User.shape.tags} {updateValue} noLabel />
	</div>

	<button class="inline-button icon-text danger" command="show-modal" commandfor="delete-user">
		<Icon i="trash" />
		{text('page.admin.users.delete_user')}
	</button>

	<FormDialog
		id="delete-user"
		submit={() => deleteUser(user.id, session?.userId).then(() => (window.location.href = '/admin/users'))}
		submitText={text('page.admin.users.delete_user')}
		submitDanger
	>
		<p>{text('page.admin.users.delete_confirm')}<br />{text('generic.action_irreversible')}</p>
	</FormDialog>
</div>

<div id="sessions" class="section main">
	<h3>{text('generic.sessions')}</h3>
	<SessionList {sessions} {user} />
</div>

<div id="preferences" class="section main">
	<h3>{text('generic.preferences')}</h3>
	<ZodForm
		bind:rootValue={user.preferences}
		schema={Preferences}
		labels={preferenceLabels}
		updateValue={(preferences: Preferences) => fetchAPI('PATCH', 'users/:id', { preferences }, user.id)}
	/>
</div>

<style>
	div.info {
		grid-template-columns: 10em 1fr 6em;
	}

	.section {
		margin-bottom: 2em;
	}
</style>
