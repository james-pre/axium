<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	export interface TopBarContentProps {
		name: string;
		icon?: string;
		href: string;
		/** How to align the content. Defaults to centered. */
		align?: 'left' | 'center' | 'right';
		/** Rendered in the middle of the top bar, e.g. a search bar. */
		children?: Snippet;
	}

	/** Mounted contents, oldest first. */
	const stack: TopBarContentProps[] = [];
	let current = $state.raw<TopBarContentProps>();
	let middle = $state<HTMLElement>();

	/** The content registered by the most recently mounted `TopBarContent`. */
	export function currentContent(): TopBarContentProps | undefined {
		return current;
	}

	/** Marks the element in the top bar that the current content's children are moved into. */
	export const topBarMiddle: Attachment<HTMLElement> = element => {
		middle = element;
		return () => {
			if (middle === element) middle = undefined;
		};
	};
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

	const props: TopBarContentProps = $props();

	stack.push(props);
	current = props;
	onDestroy(() => {
		stack.splice(stack.indexOf(props), 1);
		current = stack.at(-1);
	});

	const moveToTopBar: Attachment<HTMLElement> = element => {
		middle?.append(element);
		return () => element.remove();
	};
</script>

{#if props.children && currentContent() === props && middle}
	<div class="TopBarContent" {@attach moveToTopBar}>{@render props.children()}</div>
{/if}

<style>
	.TopBarContent {
		display: contents;
	}
</style>
