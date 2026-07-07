<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { Mailbox } from '@axium/email/common';

	let {
		value = $bindable(),
		id,
		placeholder,
	}: {
		value: Mailbox[];
		id?: string;
		placeholder?: string;
	} = $props();

	let input = $state('');
	let error = $state<string>();

	function addChip() {
		const raw = input.trim().replace(/,$/, '');
		if (!raw) return;

		// allow `Name <user@example.com>` or a bare address
		const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
		const parsed = Mailbox.safeParse(match ? { name: match[1]?.trim() || null, address: match[2] } : { address: raw });

		if (!parsed.success) {
			error = text('AddressChips.invalid', { address: raw });
			return;
		}

		error = undefined;
		if (!value.some(v => v.address == parsed.data.address)) value.push(parsed.data);
		input = '';
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key == 'Enter' || e.key == ',') {
			e.preventDefault();
			addChip();
		} else if (e.key == 'Backspace' && !input && value.length) {
			value.pop();
		}
	}
</script>

<div class="AddressChips">
	{#each value as mailbox, i}
		<span class="chip">
			{#if mailbox.name}
				<span>{mailbox.name}</span>
				<span class="subtle">&lt;{mailbox.address}&gt;</span>
			{:else}
				<span>{mailbox.address}</span>
			{/if}
			<button type="button" class="reset" onclick={() => value.splice(i, 1)}>
				<Icon i="xmark" --size="12px" />
			</button>
		</span>
	{/each}
	<input
		{id}
		type="text"
		bind:value={input}
		{onkeydown}
		onblur={addChip}
		placeholder={value.length ? '' : placeholder || text('AddressChips.placeholder')}
		class={[error && 'error']}
	/>
	{#if error}
		<span class="error">{error}</span>
	{/if}
</div>

<style>
	.AddressChips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25em;
		flex: 1;
		min-width: 0;

		input {
			border: none;
			flex: 1;
			min-width: 8em;
			padding: 0.25em 0;
		}
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.2em 0.6em;
		border-radius: 1em;
		border: var(--border-accent);
		background-color: var(--bg-accent);
		white-space: nowrap;
	}

	span.error {
		width: 100%;
		font-size: 0.85em;
	}
</style>
