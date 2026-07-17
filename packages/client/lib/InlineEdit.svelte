<script lang="ts">
	import { text } from '@axium/client';
	import { prettifyError, type ZodType } from 'zod';
	import Icon from './Icon.svelte';

	let {
		value,
		commit,
		close,
		schema,
		optional = false,
		selectionRange,
		placeholder,
		confirmLabel = text('generic.change'),
	}: {
		/** The committed value being edited. */
		value?: string | null;
		/** Called with the new value when a change is confirmed. `null` means the value was cleared (only possible when `optional`). */
		commit(value: string): unknown;
		/** Called when editing ends, whether or not a change was committed. */
		close(): void;
		/** Validates the draft as the user types and before committing. Errors float above the input. */
		schema?: ZodType;
		/** Whether clearing the input commits `null` instead of closing without changes. */
		optional?: boolean;
		/** The range of the value to select when editing starts. Defaults to the entire value. */
		selectionRange?: [number, number];
		placeholder?: string;
		confirmLabel?: string;
	} = $props();

	let draft = $state(value ?? ''),
		error = $state<string>();

	function validate(val: string | null): boolean {
		const result = val === null && optional ? undefined : schema?.safeParse(val);
		error = result?.error ? prettifyError(result.error) : undefined;
		return !result || result.success;
	}

	function confirm() {
		const newValue = draft.trim() || null;
		if (newValue === (value ?? null) || (newValue === null && !optional)) return close();
		if (!validate(newValue)) return;
		commit(newValue!);
		close();
	}
</script>

<span
	class="InlineEdit"
	data-no-select
	onclick={e => e.stopPropagation()}
	{@attach span => {
		const input = span.querySelector('input')!;
		requestAnimationFrame(() => {
			input.focus();
			input.setSelectionRange(...(selectionRange ?? [0, draft.length]));
		});
		const onOutside = (e: PointerEvent) => !span.contains(e.target as Node) && close();
		requestAnimationFrame(() => document.addEventListener('pointerdown', onOutside, true));
		return () => document.removeEventListener('pointerdown', onOutside, true);
	}}
>
	{#if error}<span class="InlineEdit-error">{error}</span>{/if}
	<input
		bind:value={draft}
		{placeholder}
		class={[error && 'error']}
		oninput={() => validate(draft.trim() || null)}
		onkeydown={e => {
			if (e.key == 'Enter') confirm();
			else if (e.key == 'Escape') close();
		}}
	/>
	<button class="reset InlineEdit-confirm" aria-label={confirmLabel} onclick={confirm}>
		<Icon i="check" />
	</button>
</span>

<style>
	.InlineEdit {
		display: flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
		anchor-scope: --inline-edit;
	}

	input {
		background: var(--bg-normal);
		border: var(--border-accent);
		border-radius: 0.25em;
		padding: 0.1em 0.25em;
		margin: -0.1em 0;
		font: inherit;
		color: inherit;
		min-width: 0;
		flex: 1 1 auto;
		anchor-name: --inline-edit;
	}

	.InlineEdit-error {
		position: fixed;
		position-anchor: --inline-edit;
		bottom: calc(anchor(top) - 0.3em);
		left: anchor(left);
		color: var(--fg-error);
	}

	.InlineEdit-confirm {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		cursor: pointer;
	}
</style>
