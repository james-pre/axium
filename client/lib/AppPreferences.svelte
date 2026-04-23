<script lang="ts">
	import { getAppPreferences, setAppPreferences, text } from '@axium/client';
	import { structurallyEqual } from 'utilium';
	import type { ZodObject } from 'zod';
	import ZodInput from './ZodInput.svelte';

	const { userId, appId, schema }: { userId: string; appId: string; schema: ZodObject } = $props();

	let initialValue = $state(await getAppPreferences(userId, appId));
	let currentValue = $state({ ...initialValue });

	function cancel() {
		currentValue = { ...initialValue };
	}

	async function save() {
		initialValue = await setAppPreferences(userId, appId, currentValue);
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
