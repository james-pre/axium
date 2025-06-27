<script lang="ts">
	import FormDialog from '$lib/FormDialog.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { fullUserInfo, session } from '@axium/client/user';
	import { getUserImage } from '@axium/core';

	let changeEmail = $state(false);
	let changeName = $state(false);
</script>

<svelte:head>
	<title>Account</title>
</svelte:head>

{#await session().then(s => fullUserInfo(s.user.id)) then user}
	<div class="Account flex-content">
		<img class="pfp" src={getUserImage(user)} alt="User profile" />
		<p class="greeting">Welcome, {user.name}</p>

		<div class="section main">
			<div class="item">
				<p class="subtle">Name</p>
				<p>{user.name}</p>
				<button style:display="contents" class="change" onclick={() => (changeName = true)}><Icon i="chevron-right" /></button>
			</div>
			<div class="item">
				<p class="subtle">Email</p>
				<p>{user.email}</p>
				<button style:display="contents" class="change" onclick={() => (changeEmail = true)}><Icon i="chevron-right" /></button>
			</div>
			<div class="item">
				<p class="subtle">User ID <dfn title="This is your UUID."><Icon i="regular/circle-info" /></dfn></p>
				<p>{user.id}</p>
			</div>
			<a class="signout" href="/auth/signout"><button>Sign out</button></a>
		</div>
	</div>

	<FormDialog bind:active={changeEmail} submitText="Change">
		<div>
			<label for="email">Email Address</label>
			<input name="email" type="email" value={user.email || ''} required />
		</div>
	</FormDialog>

	<FormDialog bind:active={changeName} submitText="Change">
		<div>
			<label for="name">What do you want to be called?</label>
			<input name="name" type="text" value={user.name || ''} required />
		</div>
	</FormDialog>
{:catch error}
	<div class="error">
		<h3>Failed to load your account</h3>
		<p>{'message' in error ? error.message : error}</p>
	</div>
{/await}

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

	.section {
		width: 50%;
		padding-top: 4em;

		> div:has(+ div) {
			border-bottom: 1px solid #8888;
		}
	}

	.section .item {
		display: grid;
		grid-template-columns: 10em 1fr 2em;
		align-items: center;
		width: 100%;
		gap: 1em;
		text-wrap: nowrap;
		padding-bottom: 1em;

		> :first-child {
			margin: 0 5em 0 1em;
			grid-column: 1;
		}

		> :nth-child(2) {
			margin: 0;
			grid-column: 2;
		}

		> :last-child:nth-child(3) {
			margin: 0;
			display: inline;
			grid-column: 3;
			font-size: 0.75em;
			cursor: pointer;
		}
	}
</style>
