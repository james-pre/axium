<script lang="ts">
	import { text } from '@axium/client';
	import FormDialog from './FormDialog.svelte';

	const {
		message,
		confirmText = text('generic.ok'),
		danger = false,
		onclose,
	}: {
		message: string;
		confirmText?: string;
		danger?: boolean;
		onclose(confirmed: boolean): void;
	} = $props();

	let dialog = $state<HTMLDialogElement>()!;
	let confirmed = false;

	$effect(() => dialog.showModal());
</script>

<FormDialog bind:dialog submitText={confirmText} submitDanger={danger} submit={() => (confirmed = true)} cancel={() => onclose(confirmed)}>
	<p>{message}</p>
</FormDialog>
