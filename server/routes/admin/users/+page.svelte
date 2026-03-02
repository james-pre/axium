<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, URLText } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import '@axium/client/styles/list';
	import type { VerificationInternal } from '@axium/core';
	import { colorHashRGB } from '@axium/core/color';

	const { data } = $props();
	let users = $state(data.users);

	let createdUserDialog = $state<HTMLDialogElement>();
	let verification = $state<VerificationInternal>();
</script>

<svelte:head>
	<title>{text('page.admin.users.title')}</title>
</svelte:head>

<h2>{text('page.admin.users.heading')}</h2>

{#snippet attr(i: string, text: string, color: string = colorHashRGB(text))}
	<span class="attribute" style:background-color={color}><Icon {i} />{text}</span>
{/snippet}

<button command="show-modal" commandfor="create-user" class="icon-text">
	<Icon i="plus" />
	{text('page.admin.users.create')}
</button>

<FormDialog
	id="create-user"
	submitText={text('generic.create')}
	submit={(data: { email: string; name: string }) =>
		fetchAPI('PUT', 'admin/users', data).then(res => {
			verification = res.verification;
			users.push(res.user);
			createdUserDialog?.showModal();
		})}
>
	<div>
		<label for="email">{text('generic.email')}</label>
		<input name="email" type="email" required />
	</div>
	<div>
		<label for="name">{text('generic.username')}</label>
		<input name="name" type="text" required />
	</div>
</FormDialog>

<dialog bind:this={createdUserDialog} id="created-user-verification">
	<h3>{text('page.admin.users.created_title')}</h3>

	<p>{text('page.admin.users.created_url')}</p>

	<URLText url="/login/token?user={verification?.userId}&token={verification?.token}" />

	<button onclick={() => createdUserDialog?.close()}>{text('generic.ok')}</button>
</dialog>

<div id="user-list" class="list">
	<div class="list-item list-header">
		<span>{text('generic.username')}</span>
		<span>{text('generic.email')}</span>
		<span>{text('page.admin.users.attributes')}</span>
	</div>
	{#each users as user}
		<div class="user list-item" onclick={e => e.currentTarget === e.target && (location.href = '/admin/users/' + user.id)}>
			<span>{user.name}</span>
			<span>{user.email}</span>
			<span class="mobile-hide">
				{#if user.isAdmin}
					{@render attr('crown', text('page.admin.users.admin_tag'), '#710')}
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
				<span class="mobile-only">{text('page.admin.users.audit')}</span>
			</a>
			<a class="icon-text mobile-button" href="/admin/users/{user.id}">
				<Icon i="chevron-right" />
				<span class="mobile-only">{text('page.admin.users.manage')}</span>
			</a>
		</div>
	{:else}
		<div class="error">{text('page.admin.users.none')}</div>
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
