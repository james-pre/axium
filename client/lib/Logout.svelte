<script lang="ts">
	import { logoutCurrentSession, text } from '@axium/client';
	import FormDialog from './FormDialog.svelte';

	let { fullPage = false }: { fullPage?: boolean } = $props();
</script>

<FormDialog
	pageMode={fullPage}
	id="logout"
	submitText={text('generic.logout')}
	submit={() => logoutCurrentSession().then(() => (window.location.href = '/'))}
>
	<p>{text('component.Logout.question')}</p>
	{#if fullPage}
		<button
			command="close"
			commandfor="logout"
			onclick={e => {
				e.preventDefault();
				history.back();
			}}>{text('component.Logout.back')}</button
		>
	{/if}
</FormDialog>
