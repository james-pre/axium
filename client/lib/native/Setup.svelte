<script lang="ts">
	import { text } from '@axium/client/locales';
	import { setPrefix, setToken, fetchAPI } from '@axium/client/requests';
	import { App } from '@capacitor/app';
	import { Browser } from '@capacitor/browser';
	import { Preferences } from '@capacitor/preferences';
	import { errorText } from 'ioium';
	import { httpUrl as z_httpUrl } from 'zod';

	const { value: existingPrefix } = await Preferences.get({ key: 'api_prefix' });

	let prefixValue = $state<string>(),
		noValidPrefix = $state<boolean>(true),
		error = $state<string>(),
		debugToken = $state<string>('');

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

	App.addListener('appUrlOpen', async data => {
		try {
			const url = new URL(data.url);
			if (url.hostname != 'login' && !url.pathname.includes('login')) return;
			const sessionRaw = url.searchParams.get('session');
			if (!sessionRaw) return;
			const session = JSON.parse(sessionRaw);
			await Preferences.set({ key: 'api_token', value: session.token });
			setToken(session.token);
			await Browser.close();
			location.reload();
		} catch (e) {
			error = errorText(e);
		}
	});

	async function openBrowserLogin() {
		if (!existingPrefix) return;
		try {
			const { origin } = new URL(existingPrefix);
			const loginUrl = new URL('/login/client?native=axium.tasks', origin);
			await Browser.open({ url: loginUrl.href });
		} catch (e) {
			error = errorText(e);
		}
	}

	async function loginWithToken() {
		if (!debugToken) return;
		try {
			await Preferences.set({ key: 'api_token', value: debugToken });
			setToken(debugToken);
			location.reload();
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
{:else}
	<div class="browser-login">
		<h1>{text('native.setup.login_title')}</h1>
		<p>{text('native.setup.login_desc')}</p>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<button onclick={openBrowserLogin}>{text('native.setup.login_button')}</button>

		<div class="debug-login">
			<p class="subtle">[Debug] Paste Session Token</p>
			<input type="text" bind:value={debugToken} />
			<button onclick={loginWithToken}>Use Token</button>
		</div>
	</div>
{/if}

<style>
	.debug-login {
		margin-top: 2em;
		border-top: var(--border-accent);
		padding-top: 1.5em;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		align-items: center;
	}
	#setup-prefix,
	.browser-login {
		display: flex;
		flex-direction: column;
		vertical-align: center;
		align-items: center;
		gap: 1em;
		padding: 2em;
	}
</style>
