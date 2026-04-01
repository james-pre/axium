<script lang="ts">
	interface Props {
		text: string;
		isDefault?: boolean;
		label?: string | null;
		link?: string;
	}

	const { text, isDefault, label, link }: Props = $props();
</script>

{#snippet content()}
	{#each text.split('\n') as line, i}
		{#if i}<br />{/if}
		<span>{line}</span>
	{/each}
{/snippet}

<span>
	{#if link}
		<a href={link} target="_blank" rel="noopener noreferrer">{@render content()}</a>
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
