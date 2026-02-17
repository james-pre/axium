<script lang="ts">
	import { decodeColor, encodeColor } from '@axium/core/color';
	import Icon from './Icon.svelte';
	import Popover from './Popover.svelte';

	let {
		value = $bindable(),
		defaultValue,
	}: {
		value?: string | null;
		defaultValue: string;
	} = $props();

	const id = $props.id();

	const builtinColors = [
		'#ff0000', // red
		'#ff7f00', // orange
		'#ffff00', // yellow
		'#bfff00', // lime green
		'#00ff00', // green
		'#00ff7f', // spring green
		'#00ffff', // cyan
		'#007fff', // sky blue
		'#0000ff', // blue
		'#7f00ff', // violet
		'#ff00ff', // magenta
	];

	const builtinEncoded = builtinColors.map(col => encodeColor(col, true));

	const isBuiltin = $derived(builtinEncoded.includes(value || defaultValue));
	const customValue = $derived(decodeColor(isBuiltin ? defaultValue : value || defaultValue));
</script>

<Popover>
	{#snippet toggle()}
		<div class="toggle">
			<div class="color" style="--color:{decodeColor(value || defaultValue)}"></div>
			<Icon i="chevron-down" />
		</div>
	{/snippet}

	<div class="colors">
		{#each builtinEncoded as color}
			<div class="color" style="--color:{decodeColor(color)}" onclick={() => (value = color)}>
				{#if value == color}<Icon i="check" />{/if}
			</div>
		{/each}
		<label class="color" for="ColorPicker:custom:{id}" style="--color:${customValue}" tabindex="-1">
			<Icon i="pencil" />
		</label>
	</div>
</Popover>

<input
	type="color"
	id="ColorPicker:custom:{id}"
	onchange={e => (value = encodeColor(e.currentTarget.value, false))}
	value={customValue}
	style:display="none"
	tabindex="-1"
/>

<style>
	.color {
		border-radius: 50%;
		width: 1.5em;
		height: 1.5em;
		aspect-ratio: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color, #ff00ff);

		&:hover {
			cursor: pointer;
		}
	}

	div.toggle {
		cursor: pointer;
		width: 4em;
		display: inline-flex;
		align-items: center;
		justify-content: space-around;
		gap: 0.25em;

		border-radius: 0.5em;
		border: 1px solid var(--border-accent);
		background-color: var(--bg-normal);
		padding: 0.25em 0.75em;
	}

	.colors {
		padding: 0.25em;
		width: max-content;
		height: max-content;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5em;
	}
</style>
