<script lang="ts">
	import Icon from '@axium/client/components/Icon';
	import { fetchAPI } from '@axium/client/requests';
	import { startAuthentication } from '@simplewebauthn/browser';

	const { data } = $props();

	let error = $state(data.error);
	let authDone = $state(false);

	async function loginFlow() {
		const response = await startAuthentication({ optionsJSON: data.options! });
		const newSession = await fetchAPI('POST', 'users/:id/auth', response, data.session.userId);
		await fetch(data.localCallback, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(newSession),
		});
	}

	function onclick() {
		loginFlow()
			.then(() => (authDone = true))
			.catch(e => {
				error = e.message;
			});
	}
</script>

<svelte:head>
	<title>Local Client Login</title>
</svelte:head>

{#if error}
	<div class="error center">{error}</div>
{:else if authDone}
	<div class="center success">
		<h1><Icon i="check" /></h1>
		<p>Login successful! You can close this tab.</p>
	</div>
{:else}
	<div id="local-login" class="center">
		<h2>Local Client Login</h2>
		<p>Are you sure you want to log in to this local client?</p>
		<div>
			<button>Cancel</button>
			<button class="danger" {onclick}>Authorize</button>
		</div>
	</div>
{/if}

<style>
	div.center {
		width: fit-content;
		height: fit-content;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		position: fixed;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 2em;
		border-radius: 1em;
	}

	#local-login {
		background-color: var(--bg-menu);
		border: var(--border-accent);
	}
</style>
