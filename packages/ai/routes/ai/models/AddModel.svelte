<script lang="ts">
	import * as ai from '@axium/ai/common';
	import { fetchAPI, text } from '@axium/client';
	import { FormDialog, Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { bytes } from 'utilium/format';

	let { dialog = $bindable(), models }: { dialog?: HTMLDialogElement; models: ai.Model[] } = $props();

	const id = $props.id();

	let query = $state(''),
		results = $state<ai.HubRepo[]>(),
		searching = $state(false),
		details = $state<ai.HubDetails>(),
		loadingDetails = $state<string>(),
		quant = $state<string>(),
		modelId = $state(''),
		name = $state('');

	const idError = $derived.by(() => {
		if (!modelId) return;
		const result = ai.ModelId.safeParse(modelId);
		if (!result.success) return result.error.issues[0].message;
		if (models.some(model => model.id == modelId)) return text('ai.add.id_taken');
	});

	async function search() {
		if (!query.trim()) return;
		searching = true;
		try {
			results = await fetchAPI('GET', 'ai/hub', { search: query.trim() });
		} catch (error) {
			toast('error', error);
		} finally {
			searching = false;
		}
	}

	/** A readable name from a repository name */
	async function select(repo: string) {
		loadingDetails = repo;
		try {
			details = await fetchAPI('GET', 'ai/hub/details', { repo });
		} catch (error) {
			toast('error', error);
			return;
		} finally {
			loadingDetails = undefined;
		}

		const fitting = details.quants.filter(option => option.fit == 'device');
		quant = (fitting.at(-1) ?? details.quants.find(option => option.fit == 'host') ?? details.quants[0])?.tag;

		name = ai.nameFromRepo(details.base ?? details.repo);
		modelId = ai.modelIdFrom(name);
		if (models.some(model => model.id == modelId) && quant) modelId = ai.modelIdFrom(`${name} ${quant}`);
	}

	function reset() {
		details = undefined;
		quant = undefined;
		modelId = '';
		name = '';
	}

	async function submit() {
		if (!details || !quant) throw text('ai.add.pick_quant');
		if (idError) throw idError;
		await fetchAPI('PUT', 'ai/models', { id: modelId, name: name.trim() || modelId, repo: details.repo, quant });
		toast('success', text('ai.add.started', { name: name.trim() || modelId }));
		reset();
		results = undefined;
		query = '';
	}
</script>

<FormDialog bind:dialog submitText={text('ai.add.download')} {submit} cancel={reset}>
	{#snippet header()}
		<h3>{text('ai.add.title')}</h3>
	{/snippet}

	{#if !details}
		<div class="search">
			<input
				type="search"
				bind:value={query}
				placeholder={text('ai.add.search')}
				onkeydown={e => {
					if (e.key != 'Enter') return;
					e.preventDefault();
					void search();
				}}
			/>
			<button type="button" class="icon-text" onclick={search} disabled={searching}>
				<Icon i="magnifying-glass" />
				<span>{text('ai.add.search_button')}</span>
			</button>
		</div>

		{#if results && !results.length}
			<p class="subtle">{text('ai.add.no_results')}</p>
		{:else if results}
			<div class="results">
				{#each results as result (result.id)}
					<button type="button" class="reset result" onclick={() => select(result.id)} disabled={!!loadingDetails}>
						<span class="repo">{result.id}</span>
						<span class="subtle stats">
							<span class="icon-text"><Icon i="download" --size="12px" />{result.downloads.toLocaleString()}</span>
							<span class="icon-text"><Icon i="heart" --size="12px" />{result.likes.toLocaleString()}</span>
							{#if result.modified}<span>{result.modified.toLocaleDateString()}</span>{/if}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<button type="button" class="reset back icon-text subtle" onclick={reset}>
			<Icon i="arrow-left" --size="12px" />
			<span>{details.repo}</span>
		</button>

		{#if !details.quants.length}
			<p class="subtle">{text('ai.add.no_quants')}</p>
		{:else}
			<div class="quants" role="radiogroup">
				{#each details.quants as option (option.tag)}
					<label class={['quant', quant == option.tag && 'selected']}>
						<input type="radio" name="{id}:quant" value={option.tag} bind:group={quant} />
						<span class="tag">{option.tag}</span>
						<span class="subtle">{bytes(option.size)}</span>
						<span class={['fit', option.fit]}>{text(`ai.fit.${option.fit}`)}</span>
					</label>
				{/each}
			</div>
		{/if}

		<div class="field">
			<label for="{id}:name">{text('ai.add.name')}</label>
			<input id="{id}:name" bind:value={name} maxlength="100" />
		</div>
		<div class="field">
			<label for="{id}:id">{text('ai.add.id')}</label>
			<input id="{id}:id" bind:value={modelId} maxlength="64" />
			{#if idError}<span class="error">{idError}</span>{/if}
		</div>
	{/if}
</FormDialog>

<style>
	.search {
		display: flex;
		gap: 0.5em;

		input {
			flex: 1;
		}
	}

	.results,
	.quants {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		max-height: 50vh;
		overflow-y: auto;
		margin-top: 0.5em;
	}

	.result,
	.quant {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5em 1em;
		padding: 0.5em 0.75em;
		border-radius: 0.5em;
		cursor: pointer;

		&:hover,
		&.selected {
			background-color: var(--bg-alt);
		}
	}

	.result {
		justify-content: space-between;
		text-align: start;

		.repo {
			overflow-wrap: anywhere;
		}

		.stats {
			display: flex;
			gap: 1em;
			font-size: 0.85em;
		}
	}

	.quant {
		input {
			display: none;
		}

		.tag {
			font-family: monospace;
			min-width: 8em;
		}

		.fit {
			margin-left: auto;
			font-size: 0.85em;
		}

		.fit.host {
			color: var(--fg-warning);
		}

		.fit.none {
			color: var(--fg-error);
		}
	}

	.back {
		margin-bottom: 0.5em;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		margin-top: 0.75em;
	}

	.error {
		color: var(--fg-error);
		font-size: 0.85em;
	}
</style>
