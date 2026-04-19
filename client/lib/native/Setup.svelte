<script lang="ts">
	import { text } from '@axium/client/locales';
	import { setPrefix, fetchAPI } from '@axium/client/requests';
	import { Preferences } from '@capacitor/preferences';
	import { errorText } from 'ioium';
	import { httpUrl as z_httpUrl } from 'zod';
	import Login from '../Login.svelte';
	import Register from '../Register.svelte';

	const { isRegister }: { isRegister?: boolean } = $props();

	const { value: existingPrefix } = await Preferences.get({ key: 'api_prefix' });

	let prefixValue = $state<string>(),
		noValidPrefix = $state<boolean>(true),
		error = $state<string>();

	const startsWithProtocol = /^https?:\/\//i;

	async function onclick() {
		try {
			if (!prefixValue) throw 'You must enter an Axium server address';
			const withProtocol = startsWithProtocol.test(prefixValue) ? prefixValue : 'https://' + prefixValue;
			const url = new URL(z_httpUrl().parse(withProtocol));
			if (url.pathname == '/') url.pathname = '/api/';
			setPrefix(url.href);
			const apps = await fetchAPI('GET', 'apps');
			await Preferences.set({ key: 'api_prefix', value: url.href });
			noValidPrefix = false;
		} catch (e) {
			error = errorText(e);
		}
	}
</script>

{#if !existingPrefix && noValidPrefix}
	<div id="setup-prefix">
		<h1>{text('native.setup.prefix')}</h1>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<input type="text" bind:value={prefixValue} placeholder="example.com" />

		<button {onclick}>{text('native.setup.next')}</button>
	</div>
{:else if isRegister}
	<Register fullPage />
{:else}
	<Login fullPage />
{/if}

<style>
	#setup-prefix {
		display: flex;
		flex-direction: column;
		vertical-align: center;
		align-items: center;
		gap: 1em;
	}
</style>
