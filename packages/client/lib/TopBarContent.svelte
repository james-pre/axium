<script module lang="ts">
	import type { Snippet } from 'svelte';

	export interface TopBarContentProps {
		name: string;
		icon?: string;
		href: string;
		/** How to align the content. Defaults to centered. */
		align?: 'left' | 'center' | 'right';
		/** Rendered in the middle of the top bar, e.g. a search bar. */
		children?: Snippet;
	}

	let stack = $state.raw<TopBarContentProps[]>([]);

	/** The content registered by the most recently mounted `TopBarContent`. */
	export function currentContent(): TopBarContentProps | undefined {
		return stack.at(-1);
	}
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

	const props: TopBarContentProps = $props();

	stack = [...stack, props];
	onDestroy(() => {
		stack = stack.filter(entry => entry !== props);
	});
</script>
