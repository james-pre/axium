<script lang="ts">
	import type { ZodObject } from 'zod';
	import AppPreferences from './AppPreferences.svelte';
	import Icon from './Icon.svelte';
	import { text } from '@axium/client';

	const { userId, appId, schema }: { userId: string; appId: string; schema: ZodObject } = $props();

	const id = 'AppPreferencesDialog:' + appId;

	let _parentDialog = $state<HTMLDialogElement>();
</script>

<button class="icon-text" command="show-modal" commandfor={id}>
	<Icon i="gear-complex" />
	<span>{text('AppPreferences.dialog_toggle')}</span>
</button>

<dialog bind:this={_parentDialog} {id}>
	<AppPreferences {userId} {appId} {schema} {_parentDialog} />
</dialog>
