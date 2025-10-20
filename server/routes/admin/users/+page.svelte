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
		<div class="user list-item">
			<span>{user.name}</span>
			<span>{user.email}</span>
			<span>
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
			<a href="/admin/audit?user={user.id}"><Icon i="file-shield" /></a>
			<a href="/admin/users/{user.id}"><Icon i="chevron-right" /></a>
		</div>
	{:else}
		<div class="error">No users!</div>
	{/each}
</div>

<style>
	.list-item {
		grid-template-columns: 1fr 1fr 3fr repeat(2, 2em);
	}

	.attribute {
		border-radius: 1em;
		padding: 0.25em 0.75em;
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
	}
</style>
