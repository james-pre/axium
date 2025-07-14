<script lang="ts">
	import { goto } from '$app/navigation';
	import { logoutCurrentSession } from '@axium/client/user';
	import FormDialog from './FormDialog.svelte';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();
</script>

<FormDialog pageMode={fullPage} bind:dialog submitText="Log Out" submit={() => logoutCurrentSession().then(() => goto('/'))}>
	<p>Are you sure you want to log out?</p>
	{#if fullPage}
		<button
			onclick={e => {
				e.preventDefault();
				dialog.close();
				history.back();
			}}>Take me back</button
		>
	{/if}
</FormDialog>
