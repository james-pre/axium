<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import * as ai from '@axium/ai/common';
	import { ModelActions, ModelStatus } from '@axium/ai/components';
	import { modelUpdates, withUpdates } from '@axium/ai/live';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { bytes } from 'utilium/format';

	const { data } = $props();

	const id = $props.id();

	const removed = $derived(modelUpdates.get(data.model.id) === null);
	const model = $derived(withUpdates([data.model])[0] ?? data.model);
	const isAdmin = $derived(!!data.session.user.isAdmin);
	const serves = $derived(
		ai.roles.filter(role => ai.resolveRole(withUpdates(data.models.models), data.models.roles, role)?.id == model.id)
	);
	const repo = $derived(model.source.split(':')[0]);

	function levelName(level: string): string {
		return ['none', ...ai.reasoningLevels].includes(level) ? text(`ai.reasoning_level.${level as 'none'}`) : level;
	}

	const reasoningOptions = $derived.by(() => {
		if (!model.reasoningLevels) return ['none'];
		return model.reasoningLevels.length ? ['none', ...model.reasoningLevels] : ['none', 'high'];
	});

	function optionName(option: string): string {
		if (option == 'high' && model.reasoningLevels?.length === 0) return text('ai.reasoning_on');
		return levelName(option);
	}

	let name = $state(data.model.name),
		reasoning = $state(data.model.reasoning ?? ''),
		systemPrompt = $state(data.model.systemPrompt ?? ''),
		device = $state(data.model.options.device ?? ''),
		context = $state(data.model.options.context),
		reserve = $state(data.model.options.reserve),
		parallel = $state(data.model.options.parallel),
		saving = $state(false);

	async function save(update: ai.ModelUpdate) {
		saving = true;
		try {
			await fetchAPI('PATCH', 'ai/models/:id', update, model.id);
			toast('success', text('ai.model_saved'));
			await invalidate('ai:conversations');
		} catch (error) {
			toast('error', error);
		} finally {
			saving = false;
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void save({
			name: name.trim() || model.name,
			reasoning: reasoning || null,
			systemPrompt: systemPrompt.trim() || null,
			options: {
				device: device.trim() || undefined,
				context: context || undefined,
				reserve: reserve ?? undefined,
				parallel: parallel || undefined,
			},
		});
	}

	function memoryText(use?: { device: number; host: number }): string {
		if (!use) return text('ai.unknown');
		return text('ai.ram.split', { device: bytes(use.device), host: bytes(use.host) });
	}
</script>

<svelte:head>
	<title>{text('ai.model_title', { name: model.name })}</title>
</svelte:head>

<div class="model-page">
	<a href="/ai/models" class="back icon-text subtle">
		<Icon i="arrow-left" --size="12px" />
		<span>{text('ai.models')}</span>
	</a>

	{#if removed}
		<p>{text('ai.model_removed')}</p>
	{:else}
		<div class="header">
			<div class="title">
				<h2>{model.name}</h2>
				<span class="subtle">{model.id}</span>
			</div>
			{#if isAdmin}
				<ModelActions {model} onremove={() => goto('/ai/models')} />
			{/if}
		</div>

		<ModelStatus {model} />

		<dl class="details">
			<dt>{text('ai.detail.source')}</dt>
			<dd>
				<a href="https://huggingface.co/{repo}" target="_blank" rel="noreferrer">{model.source}</a>
			</dd>

			<dt>{text('ai.detail.size')}</dt>
			<dd>{bytes(model.size)}</dd>

			<dt>{text('ai.detail.added')}</dt>
			<dd>{model.created.toLocaleString()}</dd>

			<dt>{text('ai.detail.context')}</dt>
			<dd>
				{model.contextLength ? text('ai.tokens', { count: model.contextLength.toLocaleString() }) : text('ai.unknown')}
				{#if model.memory?.context}
					<span class="subtle">{text('ai.detail.context_loaded', { count: model.memory.context.toLocaleString() })}</span>
				{/if}
			</dd>

			<dt>{text('ai.detail.inputs')}</dt>
			<dd>{model.inputs?.map(input => text(`ai.modality.${input}`)).join(', ') ?? text('ai.unknown')}</dd>

			<dt>{text('ai.detail.outputs')}</dt>
			<dd>{model.outputs?.map(output => text(`ai.modality.${output}`)).join(', ') ?? text('ai.unknown')}</dd>

			<dt>{text('ai.detail.roles')}</dt>
			<dd>{serves.map(role => text(`ai.role.name.${role}`)).join(', ') || text('ai.role.none')}</dd>

			<dt>{text('ai.reasoning')}</dt>
			<dd>
				{#if !model.reasoningLevels}
					{text('ai.reasoning_unknown')}
				{:else if model.reasoningLevels.length}
					{model.reasoningLevels.map(levelName).join(', ')}
				{:else}
					{text('ai.reasoning_toggle')}
				{/if}
				{#if model.templateReasoning}
					<span class="subtle">{text('ai.detail.template_default', { level: optionName(model.templateReasoning) })}</span>
				{/if}
			</dd>

			<dt>{text('ai.detail.memory_minimum')}</dt>
			<dd>{memoryText(model.memory?.minimum)}</dd>

			{#if model.memory?.current}
				<dt>{text('ai.detail.memory_current')}</dt>
				<dd>{memoryText(model.memory.current)}</dd>
			{/if}
		</dl>

		{#if isAdmin}
			<form class="settings" onsubmit={submit}>
				<h3>{text('ai.settings')}</h3>

				<div class="field">
					<label for="{id}:name">{text('ai.add.name')}</label>
					<input id="{id}:name" bind:value={name} maxlength="100" />
				</div>

				<div class="field">
					<label for="{id}:reasoning">{text('ai.detail.default_reasoning')}</label>
					<select id="{id}:reasoning" bind:value={reasoning}>
						<option value="">
							{model.templateReasoning
								? text('ai.reasoning_template', { level: optionName(model.templateReasoning) })
								: text('ai.reasoning_level.default')}
						</option>
						{#each reasoningOptions as option}
							<option value={option}>{optionName(option)}</option>
						{/each}
					</select>
				</div>

				<div class="field">
					<label for="{id}:prompt">{text('ai.detail.system_prompt')}</label>
					<textarea
						id="{id}:prompt"
						bind:value={systemPrompt}
						rows="6"
						maxlength="20000"
						placeholder={text('ai.detail.system_prompt_default')}></textarea>
				</div>

				<h4>{text('ai.detail.loading')}</h4>
				<p class="subtle">{text('ai.detail.loading_note')}</p>
				<div class="options">
					<div class="field">
						<label for="{id}:device">{text('ai.option.device')}</label>
						<input id="{id}:device" bind:value={device} placeholder={text('ai.option.automatic')} maxlength="64" />
					</div>
					<div class="field">
						<label for="{id}:context">{text('ai.option.context')}</label>
						<input id="{id}:context" type="number" min="1" bind:value={context} placeholder={text('ai.option.automatic')} />
					</div>
					<div class="field">
						<label for="{id}:reserve">{text('ai.option.reserve')}</label>
						<input id="{id}:reserve" type="number" min="0" bind:value={reserve} placeholder={text('ai.option.automatic')} />
					</div>
					<div class="field">
						<label for="{id}:parallel">{text('ai.option.parallel')}</label>
						<input
							id="{id}:parallel"
							type="number"
							min="1"
							max="64"
							bind:value={parallel}
							placeholder={text('ai.option.automatic')}
						/>
					</div>
				</div>

				<div>
					<button type="submit" disabled={saving}>{text('ai.save')}</button>
				</div>
			</form>
		{:else}
			<section>
				<h3>{text('ai.detail.system_prompt')}</h3>
				<p class="prompt">{model.systemPrompt ?? text('ai.detail.system_prompt_default')}</p>
			</section>
		{/if}
	{/if}
</div>

<style>
	.model-page {
		display: flex;
		flex-direction: column;
		gap: 1em;
		max-width: 60em;
		height: 100%;
		margin: 0 auto;
		padding: 1em 1.5em;
		overflow-y: auto;
	}

	.header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75em;
	}

	.title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25em 0.75em;

		h2 {
			margin: 0;
		}
	}

	.badge {
		padding: 0.1em 0.5em;
		border-radius: 0.5em;
		background-color: var(--bg-accent);
		font-size: 0.8em;
	}

	.details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5em 1.5em;
		margin: 0;

		dt {
			opacity: 69%;
		}

		dd {
			margin: 0;
			overflow-wrap: anywhere;
		}
	}

	.settings {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
		align-items: flex-start;

		h3,
		h4,
		p {
			margin: 0.5em 0 0;
		}
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		width: 100%;
	}

	.options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13em, 1fr));
		gap: 0.25em 0.75em;
		width: 100%;

		.field {
			display: grid;
			grid-row: span 2;
			grid-template-rows: subgrid;
			align-items: end;
			gap: 0.25em;
		}
	}

	.prompt {
		white-space: pre-wrap;
	}

	@media (width < 500px) {
		.details {
			grid-template-columns: 1fr;

			dd {
				margin-bottom: 0.5em;
			}
		}
	}
</style>
