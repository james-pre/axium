<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { UserCard, UserInitDialog } from '@axium/sysadmin/components';

	const { data } = $props();

	let users = $state(data.users);
</script>

<svelte:head>
	<title>{text('sysadmin.system_users')}</title>
</svelte:head>

<div class="users">
	<p>
		<a class="subtle icon-text back" href="/sysadmin">
			<Icon i="arrow-left" />
			<span>{text('sysadmin.back_to_main')}</span>
		</a>
	</p>

	<div class="users-header">
		<h1>{text('sysadmin.system_users')}</h1>
		<button class="icon-text" command="show-modal" commandfor="system-user-init">
			<Icon i="plus" />
			<span>{text('sysadmin.new_system_user')}</span>
		</button>
	</div>

	{#if users.length}
		<div class="cards">
			{#each users as user, i (user.id)}
				<UserCard bind:user={users[i]} deleted={() => users.splice(i, 1)} />
			{/each}
		</div>
	{:else}
		<p class="subtle">{text('sysadmin.no_system_users')}</p>
	{/if}
</div>

<UserInitDialog userId={data.session.userId} created={user => users.push(user)} />

<style>
	.users {
		padding: 2em;
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.back {
		width: fit-content;
	}

	.users-header {
		display: flex;
		gap: 1em;

		h1 {
			margin: 0;
		}

		button {
			margin-left: auto;
		}
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1em;
	}

	@media (width < 700px) {
		.users {
			padding: 1em;
			padding-bottom: 5em;
		}

		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
