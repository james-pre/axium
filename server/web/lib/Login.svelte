<script lang="ts">
	import FormDialog from '$lib/FormDialog.svelte';
	import { loginByEmail } from '@axium/client/user';

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
</FormDialog>
