<script lang="ts">
	import Setup from './Setup.svelte';
	import { text } from '@axium/client';
	import { logoutCurrentSession } from '@axium/client/user';
	import Popover from '../Popover.svelte';
	import UserPFP from '../UserPFP.svelte';
	import { Preferences } from '@capacitor/preferences';

	const { children, data } = $props();

	async function _logout() {
		await logoutCurrentSession();
		await Preferences.remove({ key: 'api_token' });
		location.reload();
	}
</script>

{#if data.needsSetup}
	<Setup />
{:else}
	<div id="native-account-container">
		<Popover showToggle="always">
			{#snippet toggle()}
				<UserPFP user={data.session.user} />
			{/snippet}

			<UserPFP user={data.session.user} --size="4em" />
			<div class="user-info">
				<strong>{data.session.user.name}</strong>
				<span class="subtle">{data.session.user.email}</span>
			</div>

			<span>Session:</span>
			<span>{text('SessionList.expires', { date: new Date(data.session.expires).toLocaleString() })}</span>

			<button class="danger" onclick={_logout}>{text('generic.logout')}</button>
		</Popover>
	</div>

	{@render children?.()}
{/if}

<style>
	#native-account-container {
		position: fixed;
		top: 1em;
		right: 1em;
		z-index: 100;

		:global(div:popover-open) {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.5em;
			text-align: center;
			padding: 1em;
		}
	}

	.user-info {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
</style>
