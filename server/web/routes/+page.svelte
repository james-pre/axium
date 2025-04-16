<script lang="ts">
	import { goto } from '$app/navigation';
	import { getUserImage } from '@axium/core';
	import '../lib/account.css';
	import Icon from '../lib/Icon.svelte';
	import '../lib/styles.css';
	import type { PageData } from './$types.js';

	const { data, children = () => {} }: { data: PageData; children?: () => any } = $props();

	const { user } = data;
	if (!user) goto('/auth/signin');

	const image = getUserImage(user);
</script>

<svelte:head>
	<title>Account</title>
</svelte:head>

<div class="flex-content">
	<img class="pfp" src={image} alt="User profile" />
	<p class="greeting">Welcome, {user.name}</p>
	<div class="account-section main">
		<div class="account-item">
			<p class="subtle">Name</p>
			<p>{user.name}</p>
			<a class="change" href="{data.prefix}/name"><Icon id="chevron-right" /></a>
		</div>
		<div class="account-item">
			<p class="subtle">Email</p>
			<p>{user.email}</p>
			<a class="change" href="{data.prefix}/email"><Icon id="chevron-right" /></a>
		</div>
		<div class="account-item">
			<p class="subtle">User ID <dfn title="This is your UUID."><Icon id="regular/circle-info" /></dfn></p>
			<p>{user.id}</p>
		</div>
		<a class="signout" href="/auth/signout"><button>Sign out</button></a>
	</div>
	{@render children()}
</div>

<style>
	.pfp {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		border: 1px solid #8888;
		margin-top: 3em;
	}

	.greeting {
		font-size: 2em;
	}

	.signout {
		margin-top: 2em;
	}
</style>
