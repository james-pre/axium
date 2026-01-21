<script lang="ts">
	import { ClipboardCopy, FormDialog, Icon, Logout, Preferences, SessionList } from '@axium/client/components';
	import '@axium/client/styles/account';
	import { createPasskey, deletePasskey, deleteUser, sendVerificationEmail, updatePasskey, updateUser } from '@axium/client/user';
	import { getUserImage } from '@axium/core/user';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const { canVerify } = data;

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
	<button style:display="contents" commandfor={name} command="show-modal">
		<Icon {i} --size="16px" />
	</button>
{/snippet}

<div class="Account flex-content">
	<div id="pfp-container">
		<img id="pfp" src={getUserImage(user)} alt="User profile" width="100px" height="100px" />
	</div>
	<p class="greeting">Welcome, {user.name}</p>

	<div id="info" class="section main">
		<h3>Personal Information</h3>
		<div class="item info">
			<p class="subtle">Name</p>
			<p>{user.name}</p>
			{@render action('edit_name')}
		</div>
		<FormDialog id="edit_name" submit={_editUser} submitText="Change">
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
		<FormDialog id="edit_email" submit={_editUser} submitText="Change">
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
		<div class="inline-button-container">
			<button command="show-modal" commandfor="logout" class="inline-button signout">Sign Out</button>
			<button command="show-modal" commandfor="delete" class="inline-button danger">Delete Account</button>
			<Logout />
			<FormDialog
				id="delete"
				submit={() => deleteUser(user.id).then(() => (window.location.href = '/'))}
				submitText="Delete Account"
				submitDanger
			>
				<p>Are you sure you want to delete your account?<br />This action can't be undone.</p>
			</FormDialog>
		</div>
	</div>

	<div id="passkeys" class="section main">
		<h3>Passkeys</h3>
		{#each passkeys as passkey}
			<div class="item passkey">
				<p>
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
				</p>
				<p>Created {passkey.createdAt.toLocaleString()}</p>
				<button commandfor="edit_passkey:{passkey.id}" command="show-modal" class="icon-text">
					<Icon i="pen" --size="16px" />
					<span class="mobile-only">Rename</span>
				</button>
				{#if passkeys.length > 1}
					<button commandfor="delete_passkey:{passkey.id}" command="show-modal" class="icon-text">
						<Icon i="trash" --size="16px" />
						<span class="mobile-only">Delete</span>
					</button>
				{:else}
					<dfn title="You must have at least one passkey" class="disabled icon-text mobile-hide">
						<Icon i="trash-slash" --fill="#888" --size="16px" />
					</dfn>
				{/if}
			</div>
			<FormDialog
				id={'edit_passkey:' + passkey.id}
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
				id={'delete_passkey:' + passkey.id}
				submit={() => deletePasskey(passkey.id).then(() => passkeys.splice(passkeys.indexOf(passkey), 1))}
				submitText="Delete"
				submitDanger={true}
			>
				<p>Are you sure you want to delete this passkey?<br />This action can't be undone.</p>
			</FormDialog>
		{/each}

		<button onclick={() => createPasskey(user.id).then(passkeys.push.bind(passkeys))} class="inline-button icon-text">
			<Icon i="plus" /> Create
		</button>
	</div>

	<div id="sessions" class="section main">
		<h3>Sessions</h3>
		<SessionList {sessions} {currentSession} {user} redirectAfterLogoutAll />
	</div>

	<div id="preferences" class="section main">
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
</style>
