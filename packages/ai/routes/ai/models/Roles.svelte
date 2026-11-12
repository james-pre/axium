<script lang="ts">
	import * as ai from '@axium/ai/common';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';

	let {
		models,
		roles = $bindable(),
		editable,
	}: {
		models: ai.Model[];
		roles: ai.Roles;
		editable: boolean;
	} = $props();

	let saving = $state(false);

	async function save(role: ai.Role, list: string[]) {
		saving = true;
		try {
			roles = await fetchAPI('PATCH', 'ai/roles', { [role]: list });
		} catch (error) {
			toast('error', error);
		} finally {
			saving = false;
		}
	}

	function move(role: ai.Role, index: number, offset: number) {
		const list = [...roles[role]];
		[list[index], list[index + offset]] = [list[index + offset], list[index]];
		void save(role, list);
	}

	function modelName(id: string): string {
		return models.find(model => model.id == id)?.name ?? id;
	}
</script>

<div class="Roles">
	{#each ai.roles as role (role)}
		{const serving = $derived(ai.resolveRole(models, roles, role))}
		{const list = $derived(roles[role])}
		{const addable = $derived(models.filter(model => !list.includes(model.id) && ai.canServe(model, role)))}
		<div class="role">
			<span class="name" title={text(`ai.role.about.${role}`)}>{text(`ai.role.name.${role}`)}</span>
			<div class="models">
				{#each list as id, index (id)}
					<span class={['model', serving?.id == id && 'serving']} title={serving?.id == id ? text('ai.role.serving') : undefined}>
						{#if editable && index}
							<button
								class="reset"
								disabled={saving}
								title={text('ai.role.move_up')}
								aria-label={text('ai.role.move_up')}
								onclick={() => move(role, index, -1)}
							>
								<Icon i="chevron-left" --size="10px" />
							</button>
						{/if}
						<span>{modelName(id)}</span>
						{#if editable}
							<button
								class="reset"
								disabled={saving}
								title={text('ai.role.remove')}
								aria-label={text('ai.role.remove')}
								onclick={() => save(role, list.toSpliced(index, 1))}
							>
								<Icon i="xmark" --size="10px" />
							</button>
						{/if}
					</span>
				{/each}

				{#if !serving}
					<span class="subtle">{text('ai.role.unavailable')}</span>
				{:else if !list.includes(serving.id)}
					<span class="subtle">{text('ai.role.fallback', { name: serving.name })}</span>
				{/if}

				{#if editable && addable.length}
					<select
						class="add"
						disabled={saving}
						aria-label={text('ai.role.add')}
						onchange={e => {
							const id = e.currentTarget.value;
							e.currentTarget.value = '';
							if (id) void save(role, [...list, id]);
						}}
					>
						<option value="">+</option>
						{#each addable as model (model.id)}
							<option value={model.id}>{model.name}</option>
						{/each}
					</select>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.Roles {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5em 1.5em;
		align-items: center;
	}

	.role {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
	}

	.name {
		cursor: help;
	}

	.models {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4em;
	}

	.model {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		padding: 0.15em 0.6em;
		border-radius: 1em;
		background-color: var(--bg-alt);
		font-size: 0.9em;

		&.serving {
			background-color: var(--bg-accent);
		}

		button:disabled {
			opacity: 30%;
		}
	}

	.add {
		padding: 0.1em 0.4em;
		font-size: 0.9em;
	}

	@media (width < 600px) {
		.Roles {
			grid-template-columns: 1fr;
		}
	}
</style>
