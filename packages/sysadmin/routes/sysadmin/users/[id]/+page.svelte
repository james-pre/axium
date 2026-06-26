<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { UserInitDialog } from '@axium/sysadmin/components';
	import { toastStatus } from '@axium/client/toast';
	import { goto } from '$app/navigation';

	const { data } = $props();

	let user = $state(data.user);
	let editDialog = $state<HTMLDialogElement>();

	function remove() {
		toastStatus(
			fetchAPI('DELETE', 'sysadmin/users/:id', {}, user.id).then(() => goto('/sysadmin/users')),
			text('sysadmin.UserCard.toast_deleted')
		);
	}
</script>

<svelte:head>
	<title>{text('sysadmin.user.page_title', user)}</title>
</svelte:head>

<div class="user-page">
	<a class="subtle icon-text back" href="/sysadmin/users">
		<Icon i="arrow-left" />
		<span>{text('sysadmin.back_to_users')}</span>
	</a>

	<div class="user-header">
		<Icon i="user" --size="3em" />
		<div>
			<h1>{user.name}</h1>
			<span class="subtle">{user.username}</span>
		</div>
		<button class="icon-text" onclick={() => editDialog!.showModal()}>
			<Icon i="pen" />
			<span>{text('sysadmin.UserCard.edit')}</span>
		</button>
		<button class="icon-text danger" onclick={remove}>
			<Icon i="trash" />
			<span>{text('generic.delete')}</span>
		</button>
	</div>
</div>

<UserInitDialog bind:dialog={editDialog} {user} edited={updated => (user = updated)} />

<style>
	.user-page {
		padding: 2em;
		display: flex;
		flex-direction: column;
		gap: 1.5em;
	}

	.back {
		width: fit-content;
	}

	.user-header {
		display: flex;
		align-items: center;
		gap: 1em;

		:global(.Icon) {
			flex-shrink: 0;
		}

		h1 {
			margin: 0;
		}
	}

	@media (width < 700px) {
		.user-page {
			padding: 1em;
			padding-bottom: 5em;
		}
	}
</style>
