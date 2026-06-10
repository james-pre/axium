<script lang="ts">
	import { text } from '@axium/client';
	import { preferences as uap } from '@axium/client';
	import { structurallyEqual } from 'utilium';
	import type { ZodObject } from 'zod';
	import ZodInput from './ZodInput.svelte';
	import { toast } from './toast.js';

	const {
		userId,
		appId,
		schema,
		_parentDialog,
	}: { userId: string; appId: string; schema: ZodObject; _parentDialog?: HTMLDialogElement } = $props();

	let initialValue = $state(await uap.get(userId, appId));
	let currentValue = $state({ ...initialValue });

	function cancel() {
		currentValue = { ...initialValue };
		_parentDialog?.close();
	}

	async function save() {
		initialValue = await uap.set(userId, appId, currentValue);
		if (!_parentDialog) return;
		_parentDialog.close();
		toast('success', text('AppPreferences.toast_saved'));
	}
</script>

<h2>{text('AppPreferences.title', { name: text(`app_name.${appId}`) })}</h2>

<ZodInput {schema} updateValue={() => {}} bind:rootValue={currentValue} path="" />

<div class="actions">
	<button onclick={cancel}>{text('generic.cancel')}</button>
	<button onclick={save} class={!structurallyEqual(initialValue, currentValue) && 'save-pending'}>{text('AppPreferences.save')}</button>
</div>

<style>
	.actions {
		margin-top: 2em;
	}

	.save-pending {
		border: var(--border-strong);
	}
</style>
