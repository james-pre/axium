<script lang="ts">
	import { loginByUsername, text } from '@axium/client';
	import FormDialog from './FormDialog.svelte';
	import authRedirect from './auth_redirect.js';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();

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
		<input name="username" type="text" required />
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
