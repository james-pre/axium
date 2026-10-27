<script lang="ts">
	import { loginByUsername, loginWithAutofill, text } from '@axium/client';
	import { browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
	import { onMount } from 'svelte';
	import FormDialog from './FormDialog.svelte';
	import authRedirect from './auth_redirect.js';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();

	onMount(async () => {
		if (!(await browserSupportsWebAuthnAutofill())) return;

		try {
			await loginWithAutofill();
		} catch (error: any) {
			// Starting another WebAuthn ceremony, such as submitting the form, aborts this one.
			if (error?.code != 'ERROR_CEREMONY_ABORTED') console.error(error);
			return;
		}

		if (!fullPage) dialog?.close();
		await authRedirect();
	});

	async function submit(data: { username: string }) {
		if (typeof data.username != 'string') {
			throw 'Tried to upload a file for a username. Huh?!';
		}

		await loginByUsername(data.username);
		const redirectAfter = await authRedirect();
		if (fullPage && redirectAfter) location.href = redirectAfter;
	}
</script>

<FormDialog bind:dialog submitText={text('generic.login')} {submit} pageMode={fullPage}>
	<div>
		<label for="username">{text('generic.username')}</label>
		<input name="username" type="text" autocomplete="username webauthn" required />
	</div>
	{#snippet footer()}
		{#if fullPage}
			<div class="footer">
				<a href="/register">{text('Login.register')}</a>
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
