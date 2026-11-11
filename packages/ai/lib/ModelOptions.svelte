<script lang="ts">
	import type { AIModel } from '@axium/ai/common';
	import { learnedModels, listen } from '@axium/ai/live';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';

	let {
		models,
		model = $bindable(),
		reasoning = $bindable(),
		onchange,
	}: { models: AIModel[]; model: string; reasoning: string; onchange?(): void } = $props();

	const id = $props.id();

	const namedLevels = ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

	function levelName(level: string): string {
		return (namedLevels as readonly string[]).includes(level)
			? text(`ai.reasoning_level.${level as (typeof namedLevels)[number]}`)
			: level;
	}

	listen();

	const selected = $derived(models.find(available => available.id == model));
	const capabilities = $derived(learnedModels.get(model) ?? selected);
	const levels = $derived(capabilities?.reasoningLevels ?? []);
	const defaultLevel = $derived(capabilities?.defaultReasoning);

	/** The model's default level is selected as `default` */
	const value = $derived(reasoning == defaultLevel ? 'default' : reasoning);

	const options = $derived.by(() => {
		const values = ['none', ...levels].map(level => (level == defaultLevel ? 'default' : level));
		if (!values.includes('default')) values.unshift('default');
		if (!values.includes(value)) values.push(value);
		return values;
	});

	const enabled = $derived(value == 'default' ? defaultLevel != 'none' : value != 'none');

	function optionLabel(option: string): string {
		if (option != 'default' || !defaultLevel) return levelName(option);
		return text('ai.reasoning_default', { level: levelName(defaultLevel) });
	}

	function change(update: () => void) {
		update();
		onchange?.();
	}

	/** Uses `default` whenever it already matches the requested state */
	function setEnabled(on: boolean) {
		const onByDefault = defaultLevel != 'none';
		change(() => (reasoning = on == onByDefault ? 'default' : on ? 'high' : 'none'));
	}
</script>

<select class="model" value={model} title={text('ai.model')} onchange={e => change(() => (model = e.currentTarget.value))}>
	{#if !selected}
		<option value={model}>{model}</option>
	{/if}
	{#each models as available}
		<option value={available.id}>{available.id}</option>
	{/each}
</select>

{#if levels.length}
	<select class="reasoning" {value} title={text('ai.reasoning')} onchange={e => change(() => (reasoning = e.currentTarget.value))}>
		{#each options as option}
			<option value={option}>{optionLabel(option)}</option>
		{/each}
	</select>
{:else}
	<span class="reasoning toggle">
		<input id="{id}:reasoning" type="checkbox" checked={enabled} onchange={e => setEnabled(e.currentTarget.checked)} />
		<label for="{id}:reasoning" class="checkbox">
			{#if enabled}<Icon i="check" --size="1.3em" />{/if}
		</label>
		<label for="{id}:reasoning">{text('ai.reasoning')}</label>
	</span>
{/if}

<style>
	select {
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		min-width: 0;
	}

	.reasoning {
		color: var(--fg-light);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;

		label {
			cursor: pointer;
		}
	}
</style>
