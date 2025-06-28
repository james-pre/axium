<script lang="ts">
	import FormDialog from '$lib/FormDialog.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { currentSession, getPasskeys } from '@axium/client/user';
	import { getUserImage } from '@axium/core';

	let changeEmail = $state(false);
	let changeName = $state(false);
</script>

<svelte:head>
	<title>Account</title>
</svelte:head>

{#await currentSession() then { session, user }}
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
			<a class="signout" href="/logout"><button>Sign out</button></a>
		</div>

		<div class="section main">
			<h3>Passkeys</h3>
			{#await getPasskeys(user.id) then passkeys}
				{#each passkeys as passkey}
					<div class="passkey">
						{#if passkey.name}
							<p>{passkey.name}</p>
						{:else}
							<p class="subtle"><i>Unnamed</i></p>
						{/if}
						<p>{passkey.createdAt.toLocaleString(navigator.language)}</p>
						<dfn title={passkey.deviceType == 'multiDevice' ? 'Multiple devices' : 'Single device'}>
							<Icon i={passkey.deviceType == 'multiDevice' ? 'laptop-mobile' : 'mobile'} />
						</dfn>
						<dfn title="This passkey is {passkey.backedUp ? '' : 'not '}backed up">
							<Icon i={passkey.backedUp ? 'circle-check' : 'circle-xmark'} />
						</dfn>
					</div>
				{/each}
			{:catch}
				<div class="error">Could not load your passkeys.</div>
			{/await}
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

	.passkey {
		display: grid;
		grid-template-columns: 10em 1fr 2em 2em;
		align-items: center;
		width: 100%;
		gap: 1em;
		text-wrap: nowrap;
		padding-bottom: 1em;
	}
</style>
