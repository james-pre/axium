<script lang="ts">
	import { ClipboardCopy, FormDialog, Icon, Logout, Preferences, SessionList } from '@axium/client/components';
	import '@axium/client/styles/account';
	import { createPasskey, deletePasskey, deleteUser, sendVerificationEmail, updatePasskey, updateUser } from '@axium/client/user';
	import { getUserImage } from '@axium/core/user';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const { canVerify } = data;

	const dialogs = $state<Record<string, HTMLDialogElement>>({});

	let verificationSent = $state(false);
	let currentSession = $state(data.currentSession);
	let user = $state(data.user);
	let passkeys = $state(data.passkeys);
	let sessions = $state(data.sessions);

	async function _editUser(data: Record<string, FormDataEntryValue>) {
		const result = await updateUser(user.id, data);
		user = result;
	}
</script>

<svelte:head>
	<title>Your Account</title>
</svelte:head>

{#snippet action(name: string, i: string = 'pen')}
	<button style:display="contents" onclick={() => dialogs[name].showModal()}>
		<Icon {i} --size="16px" />
	</button>
{/snippet}

<div class="Account flex-content">
	<div id="pfp-container">
		<img id="pfp" src={getUserImage(user)} alt="User profile" width="100px" height="100px" />
	</div>
	<p class="greeting">Welcome, {user.name}</p>

	<div class="section main">
		<h3>Personal Information</h3>
		<div class="item info">
			<p class="subtle">Name</p>
			<p>{user.name}</p>
			{@render action('edit_name')}
		</div>
		<FormDialog bind:dialog={dialogs.edit_name} submit={_editUser} submitText="Change">
			<div>
				<label for="name">What do you want to be called?</label>
				<input name="name" type="text" value={user.name || ''} required />
			</div>
		</FormDialog>
		<div class="item info">
			<p class="subtle">Email</p>
			<p>
				{user.email}
				{#if user.emailVerified}
					<dfn title="Email verified on {user.emailVerified.toLocaleDateString()}">
						<Icon i="regular/circle-check" />
					</dfn>
				{:else if canVerify}
					<button onclick={() => sendVerificationEmail(user.id).then(() => (verificationSent = true))}>
						{verificationSent ? 'Verification email sent' : 'Verify'}
					</button>
				{/if}
			</p>
			{@render action('edit_email')}
		</div>
		<FormDialog bind:dialog={dialogs.edit_email} submit={_editUser} submitText="Change">
			<div>
				<label for="email">Email Address</label>
				<input name="email" type="email" value={user.email || ''} required />
			</div>
		</FormDialog>

		<div class="item info">
			<p class="subtle">User ID <dfn title="This is your UUID. It can't be changed."><Icon i="regular/circle-info" /></dfn></p>
			<p>{user.id}</p>
			<ClipboardCopy value={user.id} --size="16px" />
		</div>
		<span>
			<button class="signout" onclick={() => dialogs.logout.showModal()}>Sign Out</button>
			<button style:cursor="pointer" onclick={() => dialogs.delete.showModal()} class="danger">Delete Account</button>
			<Logout bind:dialog={dialogs.logout} />
			<FormDialog
				bind:dialog={dialogs.delete}
				submit={() => deleteUser(user.id).then(() => (window.location.href = '/'))}
				submitText="Delete Account"
				submitDanger
			>
				<p>Are you sure you want to delete your account?<br />This action can't be undone.</p>
			</FormDialog>
		</span>
	</div>

	<div class="section main">
		<h3>Passkeys</h3>
		{#each passkeys as passkey}
			<div class="item passkey">
				<dfn title={passkey.deviceType == 'multiDevice' ? 'Multiple devices' : 'Single device'}>
					<Icon i={passkey.deviceType == 'multiDevice' ? 'laptop-mobile' : 'mobile'} --size="16px" />
				</dfn>
				<dfn title="This passkey is {passkey.backedUp ? '' : 'not '}backed up">
					<Icon i={passkey.backedUp ? 'circle-check' : 'circle-xmark'} --size="16px" />
				</dfn>
				{#if passkey.name}
					<p>{passkey.name}</p>
				{:else}
					<p class="subtle"><i>Unnamed</i></p>
				{/if}
				<p>Created {passkey.createdAt.toLocaleString()}</p>
				{@render action('edit_passkey#' + passkey.id)}
				{#if passkeys.length > 1}
					{@render action('delete_passkey#' + passkey.id, 'trash')}
				{:else}
					<dfn title="You must have at least one passkey" class="disabled">
						<Icon i="trash-slash" --fill="#888" --size="16px" />
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
		<span>
			<button onclick={() => createPasskey(user.id).then(passkeys.push.bind(passkeys))} class="icon-text">
				<Icon i="plus" /> Create
			</button>
		</span>
	</div>

	<div class="section main">
		<h3>Sessions</h3>
		<SessionList {sessions} {currentSession} {user} redirectAfterLogoutAll />
	</div>

	<div class="section main">
		<h3>Preferences</h3>
		<Preferences userId={user.id} bind:preferences={user.preferences} />
	</div>
</div>

<style>
	#pfp-container {
		width: 100px;
		height: 100px;
		margin-top: 3em;

		:global(.MenuToggle) {
			float: right;
			position: relative;
			top: -24px;
		}
	}

	#pfp {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		border: 1px solid #8888;
	}

	.greeting {
		font-size: 2em;
	}

	.signout {
		margin-top: 2em;
	}
</style>
