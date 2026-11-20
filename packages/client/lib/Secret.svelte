<script lang="ts">
	import { text } from '@axium/client';
	import type { SecretInfo, SecretStore } from '@axium/core';
	import ClipboardCopy from './ClipboardCopy.svelte';
	import FormDialog from './FormDialog.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		info: SecretInfo;
		/** Title of the edit dialog */
		label?: string;
		/** Stores a new value, which allows editing when the secret is editable */
		save?(value: string): unknown;
		minLength?: number | null;
		maxLength?: number | null;
	}

	const { info, label, save, minLength, maxLength }: Props = $props();

	let dialog = $state<HTMLDialogElement>(),
		saved = $state(false);

	const source = $derived<SecretStore | null>(saved ? 'file' : info.source),
		store = $derived<SecretStore>(source ?? (info.editable ? 'file' : 'systemd')),
		name = $derived(store == 'systemd' ? 'axium.' + info.id : info.id);

	async function submit(data: Record<string, FormDataEntryValue>) {
		await save!(String(data.value));
		saved = true;
		dialog?.querySelector('form')?.reset();
	}
</script>

<span class={['Secret', !source && 'unset']}>
	<Icon i={store == 'systemd' ? 'lock-keyhole' : 'file-lock'} title={text(`Secret.${source ?? 'unset'}`, { id: info.id })} />
	<code>{name}</code>
	<ClipboardCopy value={name} />
	{#if save && info.editable}
		<button type="button" title={text(source ? 'Secret.replace' : 'Secret.add')} onclick={() => dialog?.showModal()}>
			<Icon i="pencil" />
		</button>
		<FormDialog bind:dialog clearOnCancel submitText={text('Secret.save')} {submit}>
			<div class="Secret-heading">
				{#if label}<strong>{label}</strong>{/if}
				{#if source}<span>{text('Secret.replace_notice')}</span>{/if}
			</div>
			<textarea
				name="value"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				required
				minlength={minLength || 1}
				maxlength={maxLength ?? undefined}></textarea>
		</FormDialog>
	{/if}
</span>

<style>
	.Secret {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;

		&.unset > code {
			color: var(--fg-disabled);
		}

		> button {
			display: inline-flex;
			padding: 0;
			border: none;
			background: transparent;
		}
	}

	code {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.Secret-heading {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
	}

	textarea {
		width: min(30em, 70vw);
		field-sizing: content;
		resize: none;
		min-height: 3lh;
		max-height: 10lh;
		font-family: monospace;
	}
</style>
