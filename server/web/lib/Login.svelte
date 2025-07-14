<script lang="ts">
	import { loginByEmail } from '@axium/client/user';
	import FormDialog from './FormDialog.svelte';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();

	function submit(data) {
		if (typeof data.email != 'string') {
			throw 'Tried to upload a file for an email. Huh?!';
		}

		return loginByEmail(data.email);
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
