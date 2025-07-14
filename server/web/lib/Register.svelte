<script lang="ts">
	import { register } from '@axium/client/user';
	import FormDialog from './FormDialog.svelte';

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
	{#snippet footer()}
		{#if fullPage}
			<div class="footer">
				<a href="/login">Login instead</a>
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
