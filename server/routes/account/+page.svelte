<script lang="ts">
	import {
		createPasskey,
		deletePasskey,
		deleteUser,
		logout,
		logoutAll,
		sendVerificationEmail,
		updatePasskey,
		updateUser,
	} from '@axium/client/user';
	import { getUserImage } from '@axium/core/user';
	import { ClipboardCopy, FormDialog, Icon, Logout } from '@axium/server/components';
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
	<title>Account</title>
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
			<button onclick={() => createPasskey(user.id).then(passkeys.push.bind(passkeys))}><Icon i="plus" /> Create</button>
		</span>
	</div>

	<div class="section main">
		<h3>Sessions</h3>
		{#each sessions as session}
			<div class="item session">
				<p>
					{session.id.slice(0, 4)}...{session.id.slice(-4)}
					{#if session.id == currentSession.id}
						<span class="current">Current</span>
					{/if}
					{#if session.elevated}
						<span class="elevated">Elevated</span>
					{/if}
				</p>
				<p>Created {session.created.toLocaleString()}</p>
				<p>Expires {session.expires.toLocaleString()}</p>
				{@render action('logout#' + session.id, 'right-from-bracket')}
			</div>
			<FormDialog
				bind:dialog={dialogs['logout#' + session.id]}
				submit={async () => {
					await logout(user.id, session.id);
					dialogs['logout#' + session.id].remove();
					sessions.splice(sessions.indexOf(session), 1);
					if (session.id == currentSession.id) window.location.href = '/';
				}}
				submitText="Logout"
			>
				<p>Are you sure you want to log out this session?</p>
			</FormDialog>
		{/each}
		<span>
			<button onclick={() => dialogs.logout_all.showModal()} class="danger">Logout All</button>
		</span>
		<FormDialog
			bind:dialog={dialogs['logout_all']}
			submit={() => logoutAll(user.id).then(() => (window.location.href = '/'))}
			submitText="Logout All Sessions"
			submitDanger
		>
			<p>Are you sure you want to log out all sessions?</p>
		</FormDialog>
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

	.section {
		width: 50%;
		padding-top: 4em;

		/* This is causing duplicate separators when removing sessions/passkeys
		> div:has(+ div) {
			border-bottom: 1px solid #8888;
		}
		*/
	}

	.section .item {
		display: grid;
		align-items: center;
		width: 100%;
		gap: 1em;
		text-wrap: nowrap;
		border-top: 1px solid #8888;
		padding-bottom: 1em;
	}

	.info {
		grid-template-columns: 10em 1fr 2em;

		> :first-child {
			margin-left: 1em;
		}

		> :nth-child(2) {
			text-overflow: ellipsis;
			overflow: hidden;
		}
	}

	.passkey {
		grid-template-columns: 1em 1em 1fr 1fr 1em 1em;

		dfn:not(.disabled) {
			cursor: help;
		}
	}

	.session {
		grid-template-columns: 1fr 1fr 1fr 1em;

		.current {
			border-radius: 2em;
			padding: 0 0.5em;
			background-color: #337;
		}

		.elevated {
			border-radius: 2em;
			padding: 0 0.5em;
			background-color: #733;
		}
	}
</style>
