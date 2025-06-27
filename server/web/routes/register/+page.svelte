<script lang="ts">
	import { goto } from '$app/navigation';
	import Dialog from '$lib/Dialog.svelte';
	import { register } from '@axium/client/user';

	let { active = $bindable(null), oncancel = () => {}, pageMode = true } = $props();

	const show = $derived(!!active || pageMode);

	let error = $state<string | null>(null);

	function onclick(e: MouseEvent) {
		e.preventDefault();
		active = null;
		oncancel(e);
	}

	function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();

		const data = Object.fromEntries(new FormData(e.currentTarget));

		register(data)
			.then(() => {
				if (pageMode) goto('/');
				else active = null;
			})
			.catch(e => {
				error = e.message || 'An error occurred during registration.';
			});
	}
</script>

<svelte:head>
	<title>Sign Up</title>
</svelte:head>

<Dialog {show} onclose={() => (active = null)}>
	<form {onsubmit} class="main">
		{#if error}
			<div class="error">{error}</div>
		{/if}
		<div>
			<label for="name">Display Name</label>
			<input name="name" type="text" required />
		</div>
		<div>
			<label for="email">Email</label>
			<input name="email" type="email" required />
		</div>
		{#if pageMode}
			<button type="submit" class="submit">Register</button>
		{:else}
			<div class="actions">
				<button type="button" {onclick}>Cancel</button>
				<button type="submit" class="submit">Register</button>
			</div>
		{/if}
	</form>
</Dialog>

<style>
	.actions {
		display: flex;
		gap: 1em;
		flex-direction: row;
		justify-content: space-between;
	}
</style>
