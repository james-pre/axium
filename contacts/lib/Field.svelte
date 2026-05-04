<script lang="ts">
	interface Props {
		text: string;
		isDefault?: boolean;
		label?: string | null;
		link?: string;
	}

	const { text, isDefault, label, link }: Props = $props();

	const protocolPattern = /^\w+:(\/\/)?/i;
</script>

{#snippet content()}
	{#each text.split('\n') as line, i}
		{#if i}<br />{/if}
		<span>{line}</span>
	{/each}
{/snippet}

<span>
	{#if link}
		{#if protocolPattern.test(link)}
			<a href={link} target="_blank" rel="noopener noreferrer">{@render content()}</a>
		{:else}
			<a href={link}>{@render content()}</a>
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
