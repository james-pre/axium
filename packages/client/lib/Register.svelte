<script lang="ts">
	import { register, text } from '@axium/client';
	import FormDialog from './FormDialog.svelte';
	import authRedirect from './auth_redirect.js';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();

	async function submit(data: Record<string, FormDataEntryValue>) {
		await register(data);
		const redirectAfter = await authRedirect();
		if (fullPage && redirectAfter) location.href = redirectAfter;
	}
</script>

<FormDialog bind:dialog submitText={text('generic.register')} {submit} pageMode={fullPage}>
	<div>
		<label for="name">{text('generic.user_display_name')}</label>
		<input name="name" type="text" required />
	</div>
	<div>
		<label for="username">{text('generic.username')}</label>
		<input name="username" type="text" required />
	</div>
	{#snippet footer()}
		{#if fullPage}
			<div class="footer">
				<a href="/login">{text('Register.login')}</a>
			</div>
		{/if}
	{/snippet}
</FormDialog>

<style>
	.footer {
		margin-bottom: 1em;
		text-align: center;
		background: none;
	}
</style>
