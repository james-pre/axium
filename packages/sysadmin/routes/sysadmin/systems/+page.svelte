<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { getOnlineHosts } from '@axium/sysadmin/client/web';
	import { SystemCard, SystemInitDialog } from '@axium/sysadmin/components';

	const { data } = $props();

	let systems = $state(data.systems);

	const onlineHosts = $derived(await getOnlineHosts());
</script>

<svelte:head>
	<title>{text('sysadmin.systems')}</title>
</svelte:head>

<div class="systems">
	<p>
		<a class="subtle icon-text back" href="/sysadmin">
			<Icon i="arrow-left" />
			<span>{text('sysadmin.back_to_main')}</span>
		</a>
	</p>

	<div class="systems-header">
		<h1>{text('sysadmin.systems')}</h1>
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
</div>

<SystemInitDialog userId={data.session.userId} created={system => systems.push(system)} />

<style>
	.systems {
		padding: 2em;
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.back {
		width: fit-content;
	}

	.systems-header {
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
		.systems {
			padding: 1em;
			padding-bottom: 5em;
		}

		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
