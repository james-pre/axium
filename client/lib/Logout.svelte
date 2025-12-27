<script lang="ts">
	import { logoutCurrentSession } from '@axium/client/user';
	import FormDialog from './FormDialog.svelte';

	let { fullPage = false }: { fullPage?: boolean } = $props();
</script>

<FormDialog
	pageMode={fullPage}
	id="logout"
	submitText="Log Out"
	submit={() => logoutCurrentSession().then(() => (window.location.href = '/'))}
>
	<p>Are you sure you want to log out?</p>
	{#if fullPage}
		<button
			command="close"
			commandfor="logout"
			onclick={e => {
				e.preventDefault();
				history.back();
			}}>Take me back</button
		>
	{/if}
</FormDialog>
