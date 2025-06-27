<script lang="ts">
	import Dialog from './Dialog.svelte';
	import { fetchAPI } from '@axium/core/requests';
	import { startRegistration } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON as OptionsJSON } from '@simplewebauthn/browser';
	import './styles.css';
	import type { UUID } from 'utilium';
	import { goto } from '$app/navigation';

	let { active = $bindable(null), oncancel = () => {}, pageMode = true } = $props();

	const show = $derived(!!active || pageMode);

	let error = $state<string | null>(null);

	function onclick(e: MouseEvent) {
		e.preventDefault();
		active = null;
		oncancel(e);
	}

	async function register(data: Record<string, string>) {
		const { options, userId } = await fetchAPI<{ userId: UUID; options: OptionsJSON }>('OPTIONS', '/api/register', data);

		const response = await startRegistration({ optionsJSON: options });

		await fetchAPI('POST', '/api/register', {
			userId,
			name: data.name,
			email: data.email,
			response,
		});
	}

	function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();

		// @ts-ignore 2769 - FormData supports the iterator and iterable protocols, but TS doesn't know that for some reason
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
