<script lang="ts">
	import { goto } from '$app/navigation';
	import { getUserImage } from '@axium/core';
	import './account.css';
	import FormDialog from './FormDialog.svelte';
	import Icon from './icons/Icon.svelte';
	import './styles.css';

	const { data, children = () => {}, form } = $props();

	const user = $derived(data.user);

	$effect(() => {
		if (!user) goto('/auth/signin');
	});

	const image = $derived(getUserImage(user));

	let changeEmail = $state(false);
	let changeName = $state(false);
</script>

<div class="Account flex-content">
	<img class="pfp" src={image} alt="User profile" />
	<p class="greeting">Welcome, {user.name}</p>
	<div class="account-section main">
		<div class="account-item">
			<p class="subtle">Name</p>
			<p>{user.name}</p>
			<button style:display="contents" class="change" onclick={() => (changeName = true)}><Icon i="chevron-right" /></button>
		</div>
		<div class="account-item">
			<p class="subtle">Email</p>
			<p>{user.email}</p>
			<button style:display="contents" class="change" onclick={() => (changeEmail = true)}><Icon i="chevron-right" /></button>
		</div>
		<div class="account-item">
			<p class="subtle">User ID <dfn title="This is your UUID."><Icon i="regular/circle-info" /></dfn></p>
			<p>{user.id}</p>
		</div>
		<a class="signout" href="/auth/signout"><button>Sign out</button></a>
	</div>
	{@render children()}
</div>

<FormDialog bind:active={changeEmail} {form} submitText="Change" action="?/email">
	<div>
		<label for="email">Email Address</label>
		<input name="email" type="email" value={form?.email || user.email || ''} required />
	</div>
</FormDialog>

<FormDialog bind:active={changeName} {form} submitText="Change" action="?/name">
	<div>
		<label for="name">What do you want to be called?</label>
		<input name="name" type="text" value={form?.name || user.name || ''} required />
	</div>
</FormDialog>

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
