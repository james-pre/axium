<script lang="ts" generics="Data">
	import type { Snippet } from 'svelte';
	import type { CustomNodeProps } from './nodes.svelte.js';

	const { render, props }: { render: Snippet<[CustomNodeProps<Data>]>; props: CustomNodeProps<Data> } = $props();
</script>

{@render render(props)}
