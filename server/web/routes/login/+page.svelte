<script lang="ts">
	import { goto } from '$app/navigation';
	import Dialog from '$lib/Dialog.svelte';
	import { loginByEmail } from '@axium/client/user';

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

		if (typeof data.email != 'string') {
			error = 'Tried to upload a file for an email. Huh?!';
			return;
		}

		loginByEmail(data.email)
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
	<title>Login</title>
</svelte:head>

<Dialog {show} onclose={() => (active = null)}>
	<form {onsubmit} class="main">
		{#if error}
			<div class="error">{error}</div>
		{/if}
		<div>
			<label for="email">Email</label>
			<input name="email" type="email" required />
		</div>
		{#if pageMode}
			<button type="submit" class="submit">Login</button>
		{:else}
			<div class="actions">
				<button type="button" {onclick}>Cancel</button>
				<button type="submit" class="submit">Login</button>
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
