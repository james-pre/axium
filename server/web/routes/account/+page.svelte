<script lang="ts">
	import FormDialog from '$lib/FormDialog.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		currentSession,
		deletePasskey,
		getPasskeys,
		sendVerificationEmail,
		updatePasskey,
		updateUser,
		createPasskey,
		deleteUser,
	} from '@axium/client/user';
	import type { Passkey } from '@axium/core/api';
	import { getUserImage, type User } from '@axium/core/user';

	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	let verificationSent = $state(false);
	let user = $state<User>();

	async function ready() {
		const session = await currentSession();
		user = session.user;

		passkeys = await getPasskeys(user.id);
	}

	let passkeys = $state<Passkey[]>([]);

	async function _editUser(data) {
		const result = await updateUser(user.id, data);
		user = result;
	}
</script>

<svelte:head>
	<title>Account</title>
</svelte:head>

{#snippet action(name: string, i: string = 'pen')}
	<button
		style:display="contents"
		style:cursor="pointer"
		onclick={() => {
			dialogs[name].showModal();
		}}
	>
		<Icon {i} />
	</button>
{/snippet}

{#await ready() then}
	<div class="Account flex-content">
		<img class="pfp" src={getUserImage(user)} alt="User profile" />
		<p class="greeting">Welcome, {user.name}</p>

		<div class="section main">
			<div class="item">
				<span class="subtle">Name</span>
				<span>{user.name}</span>
				{@render action('edit_name')}
			</div>
			<FormDialog bind:dialog={dialogs.edit_name} submit={_editUser} submitText="Change">
				<div>
					<label for="name">What do you want to be called?</label>
					<input name="name" type="text" value={user.name || ''} required />
				</div>
			</FormDialog>
			<div class="item">
				<span class="subtle">Email</span>
				<span>
					{user.email}
					{#if user.emailVerified}
						<dfn title="Email verified on {new Date(user.emailVerified).toLocaleDateString()}">
							<Icon i="regular/circle-check" />
						</dfn>
					{:else}
						<button onclick={() => sendVerificationEmail(user.id).then(() => (verificationSent = true))}>
							{verificationSent ? 'Verification email sent' : 'Verify'}
						</button>
					{/if}
				</span>
				{@render action('edit_email')}
			</div>
			<FormDialog bind:dialog={dialogs.edit_email} submit={_editUser} submitText="Change">
				<div>
					<label for="email">Email Address</label>
					<input name="email" type="email" value={user.email || ''} required />
				</div>
			</FormDialog>

			<div class="item">
				<p class="subtle">User ID <dfn title="This is your UUID."><Icon i="regular/circle-info" /></dfn></p>
				<p>{user.id}</p>
			</div>
			<a class="signout" href="/logout"><button>Sign out</button></a>
			<FormDialog bind:dialog={dialogs.delete} submit={() => deleteUser(user.id)} submitText="Delete Account" submitDanger>
				<p>Are you sure you want to delete your account?<br />This action can't be undone.</p>
			</FormDialog>
		</div>

		<div class="section main">
			<h3>Passkeys</h3>
			{#each passkeys as passkey}
				<div class="passkey">
					<dfn title={passkey.deviceType == 'multiDevice' ? 'Multiple devices' : 'Single device'}>
						<Icon i={passkey.deviceType == 'multiDevice' ? 'laptop-mobile' : 'mobile'} />
					</dfn>
					<dfn title="This passkey is {passkey.backedUp ? '' : 'not '}backed up">
						<Icon i={passkey.backedUp ? 'circle-check' : 'circle-xmark'} />
					</dfn>
					<p>Created {new Date(passkey.createdAt).toLocaleString()}</p>
					{#if passkey.name}
						<p>{passkey.name}</p>
					{:else}
						<p class="subtle"><i>Unnamed</i></p>
					{/if}
					{@render action('edit_passkey#' + passkey.id)}
					{#if passkeys.length > 1}
						{@render action('delete_passkey#' + passkey.id, 'trash')}
					{:else}
						<dfn title="You must have at least one passkey" class="disabled">
							<Icon i="trash-slash" --fill="#888" />
						</dfn>
					{/if}
				</div>
				<FormDialog
					bind:dialog={dialogs['edit_passkey#' + passkey.id]}
					submit={data => {
						if (typeof data.name != 'string') throw 'Passkey name must be a string';
						passkey.name = data.name;
						return updatePasskey(passkey.id, data);
					}}
					submitText="Change"
				>
					<div>
						<label for="name">Passkey Name</label>
						<input name="name" type="text" value={passkey.name || ''} />
					</div>
				</FormDialog>
				<FormDialog
					bind:dialog={dialogs['delete_passkey#' + passkey.id]}
					submit={() => deletePasskey(passkey.id).then(() => passkeys.splice(passkeys.indexOf(passkey), 1))}
					submitText="Delete"
					submitDanger={true}
				>
					<p>Are you sure you want to delete this passkey?<br />This action can't be undone.</p>
				</FormDialog>
			{/each}
			<button onclick={() => createPasskey(user.id).then(passkeys.push.bind(passkeys))}><Icon i="plus" /> Create</button>
		</div>
	</div>
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
			margin-left: 1em;
		}
	}

	.passkey {
		display: grid;
		grid-template-columns: 1em 1em 1fr 1fr 1em 1em;
		border-top: 1px solid #8888;
		align-items: center;
		width: 100%;
		gap: 1em;
		text-wrap: nowrap;
		padding-bottom: 1em;

		dfn {
			cursor: help;
		}

		dfn.disabled {
			cursor: not-allowed;
		}
	}
</style>
