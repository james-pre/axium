<script lang="ts">
	import { loginByEmail } from '@axium/client/user';
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

<FormDialog bind:dialog submitText="Login" {submit} pageMode={fullPage}>
	<div>
		<label for="email">Email</label>
		<input name="email" type="email" required />
	</div>
	{#snippet footer()}
		{#if fullPage}
			<div class="footer">
				<a href="/register">Register instead</a>
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
