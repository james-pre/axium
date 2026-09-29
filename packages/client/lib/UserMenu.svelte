<script lang="ts">
	import { text } from '@axium/client';
	import type { UserPublic } from '@axium/core/user';
	import Icon from './Icon.svelte';
	import Logout from './Logout.svelte';
	import Popover from './Popover.svelte';
	import UserPFP from './UserPFP.svelte';

	const { user }: { user?: UserPublic } = $props();
</script>

{#if user}
	<Popover class="mobile-top">
		{#snippet toggle()}
			<button class="UserMenu reset" aria-label={user.name}>
				<UserPFP {user} />
			</button>
		{/snippet}

		<div class="UserMenu-header">
			<UserPFP {user} --size="2.5em" />
			<div>
				<strong>{user.name}</strong>
				<span class="subtle">{user.username}</span>
			</div>
		</div>

		<a class="menu-item" href="/account">
			<Icon i="user" --size="1.5em" />
			<span>{text('UserMenu.account')}</span>
		</a>

		{#if user.isAdmin}
			<a class="menu-item" href="/admin">
				<Icon i="gear-complex" --size="1.5em" />
				<span>{text('UserMenu.admin')}</span>
			</a>
		{/if}

		<button class="menu-item danger reset" command="show-modal" commandfor="logout">
			<Icon i="right-from-bracket" --size="1.5em" />
			<span>{text('generic.logout')}</span>
		</button>
	</Popover>

	<Logout />
{:else}
	<a class="UserMenu login" href="/login?after={location.pathname}">{text('UserMenu.login')}</a>
{/if}

<style>
	.UserMenu {
		display: inline-flex;
		border-radius: 50%;

		:global(.UserPFP) {
			margin: 0;
		}
	}

	.login {
		border-radius: 0.5em;
		padding: 0.5em 0.75em;
		border: var(--border-accent);
		background-color: var(--bg-alt);
	}

	.UserMenu-header {
		display: flex;
		align-items: center;
		gap: 0.75em;
		padding: 0.5em 0.75em 0.75em;
		margin-bottom: 0.25em;
		border-bottom: var(--border-accent);

		:global(.UserPFP) {
			margin: 0;
		}

		div {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
	}
</style>
