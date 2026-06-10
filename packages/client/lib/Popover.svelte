<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	const {
		children,
		toggle,
		showToggle,
		popover,
		cascadeHover = false,
		...rest
	}: {
		children(): any;
		toggle?(): any;
		showToggle?: 'hover' | 'always';
		popover?: 'auto' | 'hint' | 'manual';
		/** If set, popover toggles for parent elements will also be shown on hover (only applies for `showToggle="hover"`) */
		cascadeHover?: boolean;
	} & HTMLAttributes<HTMLDivElement> = $props();

	let popoverElement = $state<HTMLDivElement>();

	function onclick(e: MouseEvent) {
		e.stopPropagation();
		// @ts-expect-error 2345
		popoverElement?.togglePopover({ source: e.currentTarget });
	}
</script>

<div class="Popover" {onclick} style:display="contents">
	{#if toggle}
		{@render toggle()}
	{:else}
		<span class={[showToggle == 'hover' && 'toggle-hover', cascadeHover && 'cascade-hover']}>
			<Icon i="ellipsis" />
		</span>
	{/if}

	<div popover={popover || 'auto'} bind:this={popoverElement} {...rest}>
		{@render children()}
	</div>
</div>

<style>
	div.Popover {
		anchor-scope: --popover;

		> :global(:first-child:hover) {
			cursor: pointer;
		}

		> :global(:first-child) {
			user-select: none;
			anchor-name: --popover;
		}
	}

	@media (width > 700px) {
		.toggle-hover {
			visibility: hidden;
		}

		:global(:hover) > div > .toggle-hover {
			visibility: visible;
		}

		:global(:hover:has(:hover > .Popover > .toggle-hover)) > div > .toggle-hover:not(.cascade-hover) {
			visibility: hidden;
		}
	}

	:popover-open {
		position-anchor: --popover;
		position-try-fallbacks:
			flip-inline,
			flip-block,
			flip-block flip-inline;
		position-visibility: always;
		left: anchor(left);
		top: anchor(bottom);
	}
</style>
