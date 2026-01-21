<script lang="ts">
	import { Dialog, FormDialog, Icon, ClipboardCopy, URLText } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import '@axium/client/styles/list';
	import type { VerificationInternal } from '@axium/core';
	import { colorHash } from '@axium/core/color';

	const { data } = $props();

	let createdUserDialog = $state<HTMLDialogElement>();
	let verification = $state<VerificationInternal>();
</script>

<svelte:head>
	<title>Admin - Users</title>
</svelte:head>

<h2>Users</h2>

{#snippet attr(i: string, text: string, color: string = colorHash(text))}
	<span class="attribute" style:background-color={color}><Icon {i} />{text}</span>
{/snippet}

<button command="show-modal" commandfor="create-user" class="icon-text">
	<Icon i="plus" />
	Create User
</button>

<FormDialog
	id="create-user"
	submitText="Create"
	submit={(data: { email: string; name: string }) =>
		fetchAPI('PUT', 'admin/users', data).then(v => {
			verification = v;
			createdUserDialog?.showModal();
		})}
>
	<div>
		<label for="email">Email</label>
		<input name="email" type="email" required />
	</div>
	<div>
		<label for="name">Name</label>
		<input name="name" type="text" required />
	</div>
</FormDialog>

<Dialog bind:dialog={createdUserDialog} id="created-user-verification">
	<h3>New User Created</h3>

	<p>They can log in using this URL:</p>

	<URLText url="/login/token?user={verification?.userId}&token={verification?.token}" />

	<button onclick={() => createdUserDialog?.close()}>Okay</button>
</Dialog>

<div id="user-list" class="list">
	<div class="list-item list-header">
		<span>Name</span>
		<span>Email</span>
		<span>Attributes</span>
	</div>
	{#each data.users as user}
		<div class="user list-item" onclick={e => e.currentTarget === e.target && (location.href = '/admin/users/' + user.id)}>
			<span>{user.name}</span>
			<span>{user.email}</span>
			<span class="mobile-hide">
				{#if user.isAdmin}
					{@render attr('crown', 'Admin', '#710')}
				{/if}
				{#each user.tags as tag}
					{@render attr('hashtag', tag)}
				{/each}
				{#each user.roles as role}
					{@render attr('at', role)}
				{/each}
			</span>
			<a class="icon-text mobile-button" href="/admin/audit?user={user.id}">
				<Icon i="file-shield" />
				<span class="mobile-only">Audit</span>
			</a>
			<a class="icon-text mobile-button" href="/admin/users/{user.id}">
				<Icon i="chevron-right" />
				<span class="mobile-only">Manage</span>
			</a>
		</div>
	{:else}
		<div class="error">No users!</div>
	{/each}
</div>

<style>
	.attribute {
		border-radius: 1em;
		padding: 0.25em 0.75em;
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
	}

	.list-item {
		grid-template-columns: 1fr 1fr 3fr repeat(2, 2em);
	}

	@media (width < 700px) {
		.list-item {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
