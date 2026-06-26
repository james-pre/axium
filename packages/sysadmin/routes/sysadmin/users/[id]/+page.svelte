<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { socket } from '@axium/client/socket';
	import { toastStatus } from '@axium/client/toast';
	import { SystemCard, UserInitDialog } from '@axium/sysadmin/components';

	const { data } = $props();

	let user = $state(data.user);
	let systems = $state(data.systems);
	let editDialog = $state<HTMLDialogElement>();

	const onlineHosts = $derived(await socket?.emitWithAck('sysadmin:ping').then(systems => systems.map(s => s.hostname)));

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
	<a class="subtle icon-text back" href="/sysadmin">
		<Icon i="arrow-left" />
		<span>{text('sysadmin.back_to_main')}</span>
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

	<section>
		<h2><Icon i="server" /> {text('sysadmin.user.systems')}</h2>
		{#if systems.length}
			<div class="cards">
				{#each systems as system, i (system.id)}
					<SystemCard
						bind:system={systems[i]}
						online={!!onlineHosts?.includes(system.hostname)}
						deleted={() => systems.splice(i, 1)}
					/>
				{/each}
			</div>
		{:else}
			<p class="subtle">{text('sysadmin.user.no_systems')}</p>
		{/if}
	</section>
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

	section {
		display: flex;
		flex-direction: column;
		gap: 1em;

		h2 {
			margin: 0;
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1em;
	}

	@media (width < 700px) {
		.user-page {
			padding: 1em;
			padding-bottom: 5em;
		}

		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
