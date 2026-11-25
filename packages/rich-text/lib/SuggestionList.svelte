<script lang="ts" generics="Data">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import type { SuggestionItem } from './nodes.svelte.js';

	const {
		suggestions,
	}: {
		suggestions: { items: SuggestionItem<Data>[]; loading: boolean; select(item: SuggestionItem<Data>): void };
	} = $props();

	let active = $state(0);

	$effect(() => {
		suggestions.items;
		active = 0;
	});

	export function keydown(event: KeyboardEvent): boolean {
		const count = suggestions.items.length;
		if (!count) return false;

		switch (event.key) {
			case 'ArrowDown':
				active = (active + 1) % count;
				return true;
			case 'ArrowUp':
				active = (active - 1 + count) % count;
				return true;
			case 'Enter':
			case 'Tab':
				suggestions.select(suggestions.items[active]);
				return true;
			default:
				return false;
		}
	}
</script>

<div class="suggestions" role="listbox">
	{#each suggestions.items as item, index}
		<div
			class={['menu-item', 'icon-text', index == active && 'active']}
			role="option"
			aria-selected={index == active}
			tabindex="-1"
			onmousedown={event => event.preventDefault()}
			onclick={() => suggestions.select(item)}
			onpointerenter={() => (active = index)}
		>
			{#if item.i}<Icon i={item.i} />{/if}
			{item.text}
		</div>
	{:else}
		<div class="empty">{text(suggestions.loading ? 'RichText.suggestions_loading' : 'RichText.suggestions_empty')}</div>
	{/each}
</div>

<style>
	.suggestions {
		display: flex;
		flex-direction: column;
		min-width: 12em;
		max-height: 20em;
		overflow-y: auto;
	}

	.active {
		background-color: var(--bg-strong);
	}

	.empty {
		padding: 0.5em 0.75em;
		opacity: 0.7;
	}
</style>
