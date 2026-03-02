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
		<label for="name">{text('component.Register.name')}</label>
		<input name="name" type="text" required />
	</div>
	<div>
		<label for="email">{text('component.Register.email')}</label>
		<input name="email" type="email" required />
	</div>
	{#snippet footer()}
		{#if fullPage}
			<div class="footer">
				<a href="/login">{text('component.Register.login')}</a>
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
