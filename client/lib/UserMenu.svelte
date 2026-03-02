<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { getUserImage } from '@axium/core';
	import type { UserPublic } from '@axium/core/user';
	import Icon from './Icon.svelte';
	import Logout from './Logout.svelte';
	import Popover from './Popover.svelte';

	const { user }: { user?: UserPublic } = $props();
</script>

{#if user}
	<Popover>
		{#snippet toggle()}
			<div class="UserMenu toggle">
				<img src={getUserImage(user)} alt={user.name} />
				{user.name}
			</div>
		{/snippet}

		<a class="menu-item" href="/account">
			<Icon i="user" --size="1.5em" />
			<span>{text('component.UserMenu.account')}</span>
		</a>

		{#if user.isAdmin}
			<a class="menu-item" href="/admin">
				<Icon i="gear-complex" --size="1.5em" />
				<span>{text('component.UserMenu.admin')}</span>
			</a>
		{/if}

		{#await fetchAPI('GET', 'apps')}
			<i>{text('generic.loading')}</i>
		{:then apps}
			{#each apps as app}
				<a class="menu-item" href="/{app.id}">
					{#if app.image}
						<img src={app.image} alt={app.name} width="1em" height="1em" />
					{:else if app.icon}
						<Icon i={app.icon} --size="1.5em" />
					{:else}
						<Icon i="image-circle-xmark" --size="1.5em" />
					{/if}
					<span>{app.name}</span>
				</a>
			{:else}
				<i>{text('component.AppMenu.none')}</i>
			{/each}
		{:catch}
			<i>{text('component.AppMenu.failed')}</i>
		{/await}

		<button class="menu-item logout reset" command="show-modal" commandfor="logout">
			<Icon i="right-from-bracket" --size="1.5em" --fill="hsl(0 33 var(--fg-light))" />
			<span>{text('generic.logout')}</span>
		</button>
	</Popover>

	<Logout />
{:else}
	<div class="UserMenu login">
		<a href="/login?after={location.pathname}">Login</a>
	</div>
{/if}

<style>
	.UserMenu {
		border-radius: 0.5em;
		padding: 0.5em;
		border: var(--border-accent);
		cursor: pointer;
		background-color: var(--bg-alt);
	}

	img {
		width: 2em;
		height: 2em;
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 0.5em;
	}

	.logout {
		color: hsl(0 33 var(--fg-light));
		font-size: 16px;
	}

	:global(.UserMenu + div:popover-open) {
		position: fixed;
		left: unset;
		right: anchor(right);
		top: calc(anchor(bottom) + 0.5em);
		width: fit-content;
		height: fit-content;
		cursor: default;
	}
</style>
