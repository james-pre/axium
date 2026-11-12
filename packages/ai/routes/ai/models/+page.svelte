<script lang="ts">
	import { ModelActions, ModelStatus } from '@axium/ai/components';
	import { withUpdates } from '@axium/ai/live';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { bytes } from 'utilium/format';
	import * as ai from '@axium/ai/common';
	import AddModel from './AddModel.svelte';
	import MemoryMeter from './MemoryMeter.svelte';
	import Roles from './Roles.svelte';

	const { data } = $props();

	let current = $state(data.models);
	let addDialog = $state<HTMLDialogElement>();

	const models = $derived(withUpdates(current.models));
	const isAdmin = $derived(!!data.session.user.isAdmin);

	async function refresh() {
		if (document.hidden) return;
		current = await fetchAPI('GET', 'ai/models').catch(() => current);
	}

	$effect(() => {
		const interval = setInterval(refresh, 5000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>{text('ai.models_title')}</title>
</svelte:head>

<div class="models-page">
	<div class="header">
		<h2>{text('ai.models')}</h2>
		{#if isAdmin}
			<button class="icon-text" onclick={() => addDialog?.showModal()}>
				<Icon i="plus" />
				<span>{text('ai.add.title')}</span>
			</button>
		{/if}
	</div>

	{#if !current.running}
		<p class="error">{text('ai.not_running')}</p>
	{/if}

	<section>
		<h3>{text('ai.ram.title')}</h3>
		<MemoryMeter memory={current.memory} {models} />
	</section>

	<section class="list">
		{#each models as model (model.id)}
			<div class="model">
				<div class="info">
					<div class="title">
						<a href="/ai/models/{model.id}" class="name">{model.name}</a>
						{#each ai.roles.filter(role => ai.resolveRole(models, current.roles, role)?.id == model.id) as role (role)}
							<span class="badge">{text(`ai.role.name.${role}`)}</span>
						{/each}
					</div>
					<span class="subtle">{model.id}</span>
				</div>
				<ModelStatus {model} />
				<span class="subtle size">{bytes(model.size)}</span>
				<div class="actions">
					{#if isAdmin}
						<ModelActions {model} onremove={refresh} />
					{/if}
				</div>
				<Icon i="chevron-right" />
			</div>
		{:else}
			<p class="subtle">{text(isAdmin ? 'ai.no_models_admin' : 'ai.no_models')}</p>
		{/each}
	</section>

	<section>
		<h3>{text('ai.role.title')}</h3>
		<p class="subtle">{text('ai.role.description')}</p>
		<Roles {models} bind:roles={current.roles} editable={isAdmin} />
	</section>
</div>

{#if isAdmin}
	<AddModel bind:dialog={addDialog} {models} />
{/if}

<style>
	.models-page {
		display: flex;
		flex-direction: column;
		gap: 1.5em;
		max-width: 60em;
		height: 100%;
		margin: 0 auto;
		padding: 1em 1.5em;
		overflow-y: auto;
	}

	.header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1em;

		h2 {
			margin: 0;
		}
	}

	h3 {
		margin: 0 0 0.75em;
	}

	h3 + p {
		margin: -0.5em 0 0.75em;
	}

	.list {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(8em, max-content) max-content max-content max-content;
		gap: 0.5em 0;
	}

	.model {
		position: relative;
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		gap: 0.5em 1.5em;
		padding: 0.75em 1em;
		border-radius: 0.75em;
		background-color: var(--bg-alt);

		&:hover {
			background-color: var(--bg-strong);
		}
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;

		.title {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.25em 0.75em;
		}

		.name {
			font-weight: bold;

			&::after {
				content: '';
				position: absolute;
				inset: 0;
				border-radius: inherit;
			}
		}
	}

	.actions {
		position: relative;
	}

	.badge {
		padding: 0.1em 0.5em;
		border-radius: 0.5em;
		background-color: var(--bg-accent);
		font-size: 0.8em;
	}

	.size {
		text-align: end;
	}

	.error {
		color: var(--fg-error);
	}

	@media (width < 800px) {
		.list {
			grid-template-columns: minmax(0, 1fr) max-content max-content;
		}

		.actions {
			grid-column: 1 / 3;
		}
	}
</style>
