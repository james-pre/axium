<script lang="ts">
	import { invalidate } from '$app/navigation';

	interface Props {
		text: string;
		isDefault?: boolean;
		label?: string | null;
		link?: string;
	}

	const { text, isDefault, label, link }: Props = $props();

	const invalidatePattern = /^\/contacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
</script>

{#snippet content()}
	{#each text.split('\n') as line, i}
		{#if i}<br />{/if}
		<span>{line}</span>
	{/each}
{/snippet}

<span>
	{#if link}
		{#if link[0] == '/' && link[1] != '/'}
			<a href={link} onclick={() => invalidate(url => invalidatePattern.test(url.pathname))}>{@render content()}</a>
		{:else}
			<a href={link} target="_blank" rel="noopener noreferrer">{@render content()}</a>
		{/if}
	{:else}
		{@render content()}
	{/if}
	{#if label}
		<span class="subtle"> • {label}</span>
	{/if}
	{#if isDefault}
		<span class="subtle"> (default)</span>
	{/if}
</span>
