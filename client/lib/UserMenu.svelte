<script lang="ts">
	import type { User } from '@axium/core/user';
	import { getUserImage } from '@axium/core';
	import { fetchAPI } from '@axium/client/requests';
	import Icon from './Icon.svelte';
	import Popover from './Popover.svelte';
	import Logout from './Logout.svelte';

	const { user }: { user: Partial<User> } = $props();

	let logout = $state<HTMLDialogElement>()!;
</script>

<Popover>
	{#snippet toggle()}
		<div style:display="contents">
			<img src={getUserImage(user)} alt={user.name} />
			{user.name}
		</div>
	{/snippet}

	<a class="menu-item" href="/account">
		<Icon i="user" --size="1.5em" />
		<span>Your Account</span>
	</a>

	{#if user.isAdmin}
		<a class="menu-item" href="/admin">
			<Icon i="gear-complex" --size="1.5em" />
			<span>Administration</span>
		</a>
	{/if}

	{#await fetchAPI('GET', 'apps')}
		<i>Loading...</i>
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
			<i>No apps available.</i>
		{/each}
	{:catch}
		<i>Couldn't load apps.</i>
	{/await}

	<span class="menu-item logout" onclick={() => logout.showModal()}>
		<Icon i="right-from-bracket" --size="1.5em" --fill="hsl(0 33 var(--fg-light))" />
		<span>Logout</span>
	</span>
</Popover>

<Logout bind:dialog={logout} />

<style>
	img {
		width: 2em;
		height: 2em;
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 0.5em;
	}

	span.logout > span {
		color: hsl(0 33 var(--fg-light));
	}
</style>
