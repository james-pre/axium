<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children(): any;
		menu(
			/**
			 * Shortcut to quickly create a generic action in the context menu.
			 */
			action: (icon: string, text: string, action: (event: MouseEvent) => void) => any
		): any;
		actions: Record<string, () => void>;
	}

	let { children, menu, actions, ...rest }: Props = $props();

	let popover = $state<HTMLDivElement>();

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		popover!.togglePopover();
		_forcePopover = true;
	}

	let _forcePopover = false;

	/**
	 * Workaround for https://github.com/whatwg/html/issues/10905
	 * @todo Remove when the problem is fixed.
	 */
	function onpointerup(e: PointerEvent) {
		if (!_forcePopover) return;
		e.stopPropagation();
		e.preventDefault();
		popover!.togglePopover();
		_forcePopover = false;
	}
</script>

{#snippet action(i: string, text: string, action: (event: MouseEvent) => void)}
	<div
		onclick={e => {
			e.stopPropagation();
			e.preventDefault();
			action(e);
		}}
		class="action"
	>
		{#if i}<Icon {i} --size="14px" />{/if}
		{text}
	</div>
{/snippet}

<div data-axium-context-menu {oncontextmenu} {onpointerup} {...rest}>
	{@render children()}
	<div popover bind:this={popover}>
		{@render menu(action)}
	</div>
</div>

<style>
	[data-axium-context-menu] {
		display: contents;
	}

	div.action:hover {
		cursor: pointer;
		background-color: var(--bg-strong);
		border-radius: 0.25em;
	}
</style>
