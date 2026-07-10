<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { getOnlineHosts } from '@axium/sysadmin/client/web';
	import { SystemCard, SystemInitDialog, UserCard, UserInitDialog } from '@axium/sysadmin/components';

	const { data } = $props();

	let systems = $state(data.systems);
	let users = $state(data.users);

	const onlineHosts = $derived(await getOnlineHosts());
</script>

<svelte:head>
	<title>{text('sysadmin.page_title')}</title>
</svelte:head>

<div class="sysadmin-main">
	<h1>{text('sysadmin.page_title')}</h1>

	<section>
		<div class="section-header">
			<h2>{text('sysadmin.systems')}</h2>
			<a class="subtle" href="/sysadmin/systems">{text('sysadmin.view_all')}</a>
			<button class="icon-text" command="show-modal" commandfor="system-init">
				<Icon i="plus" />
				<span>{text('sysadmin.new_system')}</span>
			</button>
		</div>

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
			<p class="subtle">{text('sysadmin.no_systems')}</p>
		{/if}
	</section>

	<section>
		<div class="section-header">
			<h2>{text('sysadmin.system_users')}</h2>
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
	</section>
</div>

<SystemInitDialog userId={data.session.userId} created={system => systems.push(system)} />
<UserInitDialog userId={data.session.userId} created={user => users.push(user)} />

<style>
	.sysadmin-main {
		padding: 2em;
		display: flex;
		flex-direction: column;
		gap: 2em;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 1em;

		h2 {
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
		.sysadmin-main {
			padding: 1em;
			padding-bottom: 5em;
		}

		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
