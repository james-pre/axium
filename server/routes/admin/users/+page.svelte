<script lang="ts">
	import Icon from '@axium/client/components/Icon';
	import '@axium/client/styles/list';
	import { colorHash } from '@axium/core/color';

	const { data } = $props();
</script>

<svelte:head>
	<title>Admin - Users</title>
</svelte:head>

<h2>Users</h2>

{#snippet attr(i: string, text: string, color: string = colorHash(text))}
	<span class="attribute" style:background-color={color}><Icon {i} />{text}</span>
{/snippet}

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
