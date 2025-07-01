<script lang="ts">
	import FormDialog from '$lib/FormDialog.svelte';
	import { loginByEmail } from '@axium/client/user';

	let { dialog = $bindable(), pageMode = true } = $props();

	function submit(data) {
		if (typeof data.email != 'string') {
			throw 'Tried to upload a file for an email. Huh?!';
		}

		return loginByEmail(data.email);
	}
</script>

<svelte:head>
	<title>Login</title>
</svelte:head>

<FormDialog bind:dialog submitText="Login" {submit} {pageMode}>
	<div>
		<label for="email">Email</label>
		<input name="email" type="email" required />
	</div>
</FormDialog>
