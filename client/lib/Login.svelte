<script lang="ts">
	import { loginByEmail, text } from '@axium/client';
	import FormDialog from './FormDialog.svelte';
	import authRedirect from './auth_redirect.js';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();

	async function submit(data: { email: string }) {
		if (typeof data.email != 'string') {
			throw 'Tried to upload a file for an email. Huh?!';
		}

		await loginByEmail(data.email);
		const redirectAfter = await authRedirect();
		if (fullPage && redirectAfter) location.href = redirectAfter;
	}
</script>

<FormDialog bind:dialog submitText={text('generic.login')} {submit} pageMode={fullPage}>
	<div>
		<label for="email">{text('component.Login.email')}</label>
		<input name="email" type="email" required />
	</div>
	{#snippet footer()}
		{#if fullPage}
			<div class="footer">
				<a href="/register">{text('component.Login.register')}</a>
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
