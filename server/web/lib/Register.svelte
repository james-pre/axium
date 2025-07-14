<script lang="ts">
	import FormDialog from '$lib/FormDialog.svelte';
	import { register } from '@axium/client/user';

	let { dialog = $bindable(), fullPage = false }: { dialog?: HTMLDialogElement; fullPage?: boolean } = $props();
</script>

<FormDialog bind:dialog submitText="Register" submit={register} pageMode={fullPage}>
	<div>
		<label for="name">Display Name</label>
		<input name="name" type="text" required />
	</div>
	<div>
		<label for="email">Email</label>
		<input name="email" type="email" required />
	</div>
</FormDialog>
