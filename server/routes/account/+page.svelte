<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { ClipboardCopy, FormDialog, Icon, Logout, SessionList, ZodForm } from '@axium/client/components';
	import '@axium/client/styles/account';
	import { createPasskey, deletePasskey, deleteUser, sendVerificationEmail, updatePasskey, updateUser } from '@axium/client/user';
	import { preferenceLabels, Preferences } from '@axium/core/preferences';
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
	<title>{text('page.account.title')}</title>
</svelte:head>

{#snippet action(name: string, i: string = 'pen')}
	<button style:display="contents" commandfor={name} command="show-modal">
		<Icon {i} --size="16px" />
	</button>
{/snippet}

<div class="Account flex-content">
	<div id="pfp-container">
		<img id="pfp" src={getUserImage(user)} alt={text('page.account.profile_alt')} width="100px" height="100px" />
	</div>
	<p class="greeting">{text('page.account.greeting', { name: user.name })}</p>

	<div id="info" class="section main">
		<h3>{text('page.account.personal_info')}</h3>
		<div class="item info">
			<p class="subtle">{text('generic.username')}</p>
			<p>{user.name}</p>
			{@render action('edit_name')}
		</div>
		<FormDialog id="edit_name" submit={_editUser} submitText={text('generic.change')}>
			<div>
				<label for="name">{text('page.account.edit_name')}</label>
				<input name="name" type="text" value={user.name || ''} required />
			</div>
		</FormDialog>
		<div class="item info">
			<p class="subtle">{text('generic.email')}</p>
			<p>
				{user.email}
				{#if user.emailVerified}
					<dfn title={text('page.account.email_verified_on', { date: user.emailVerified.toLocaleDateString() })}>
						<Icon i="regular/circle-check" />
					</dfn>
				{:else if canVerify}
					<button onclick={() => sendVerificationEmail(user.id).then(() => (verificationSent = true))}>
						{verificationSent ? text('page.account.verification_sent') : text('page.account.verify')}
					</button>
				{/if}
			</p>
			{@render action('edit_email')}
		</div>
		<FormDialog id="edit_email" submit={_editUser} submitText={text('generic.change')}>
			<div>
				<label for="email">{text('page.account.edit_email')}</label>
				<input name="email" type="email" value={user.email || ''} required />
			</div>
		</FormDialog>

		<div class="item info">
			<p class="subtle">
				{text('page.account.user_id')} <dfn title={text('page.account.user_id_hint')}><Icon i="regular/circle-info" /></dfn>
			</p>
			<p>{user.id}</p>
			<ClipboardCopy value={user.id} --size="16px" />
		</div>
		<div class="inline-button-container">
			<button command="show-modal" commandfor="logout" class="inline-button logout">{text('generic.logout')}</button>
			<button command="show-modal" commandfor="delete" class="inline-button danger">{text('page.account.delete_account')}</button>
			<Logout />
			<FormDialog
				id="delete"
				submit={() => deleteUser(user.id).then(() => (window.location.href = '/'))}
				submitText={text('page.account.delete_account')}
				submitDanger
			>
				<p>{text('page.account.delete_account_confirm')}<br />{text('generic.action_irreversible')}</p>
			</FormDialog>
		</div>
	</div>

	<div id="passkeys" class="section main">
		<h3>{text('page.account.passkeys.title')}</h3>
		{#each passkeys as passkey}
			<div class="item passkey">
				<p>
					<dfn
						title={passkey.deviceType == 'multiDevice'
							? text('page.account.passkeys.multi_device')
							: text('page.account.passkeys.single_device')}
					>
						<Icon i={passkey.deviceType == 'multiDevice' ? 'laptop-mobile' : 'mobile'} --size="16px" />
					</dfn>
					<dfn title={passkey.backedUp ? text('page.account.passkeys.backed_up') : text('page.account.passkeys.not_backed_up')}>
						<Icon i={passkey.backedUp ? 'circle-check' : 'circle-xmark'} --size="16px" />
					</dfn>
					{#if passkey.name}
						<p>{passkey.name}</p>
					{:else}
						<p class="subtle"><i>{text('generic.unnamed')}</i></p>
					{/if}
				</p>
				<p>{text('page.account.passkeys.created', { date: passkey.createdAt.toLocaleString() })}</p>
				<button commandfor="edit_passkey:{passkey.id}" command="show-modal" class="icon-text">
					<Icon i="pen" --size="16px" />
					<span class="mobile-only">{text('page.account.passkeys.rename')}</span>
				</button>
				{#if passkeys.length > 1}
					<button commandfor="delete_passkey:{passkey.id}" command="show-modal" class="icon-text">
						<Icon i="trash" --size="16px" />
						<span class="mobile-only">{text('page.account.passkeys.delete')}</span>
					</button>
				{:else}
					<dfn title={text('page.account.passkeys.min_one')} class="disabled icon-text mobile-hide">
						<Icon i="trash-slash" --fill="#888" --size="16px" />
					</dfn>
				{/if}
			</div>
			<FormDialog
				id={'edit_passkey:' + passkey.id}
				submit={data => {
					if (typeof data.name != 'string') throw text('page.account.passkeys.name_type_error');
					passkey.name = data.name;
					return updatePasskey(passkey.id, data);
				}}
				submitText={text('generic.change')}
			>
				<div>
					<label for="name">{text('page.account.passkeys.edit_name')}</label>
					<input name="name" type="text" value={passkey.name || ''} />
				</div>
			</FormDialog>
			<FormDialog
				id={'delete_passkey:' + passkey.id}
				submit={() => deletePasskey(passkey.id).then(() => passkeys.splice(passkeys.indexOf(passkey), 1))}
				submitText={text('page.account.passkeys.delete')}
				submitDanger={true}
			>
				<p>{text('page.account.passkeys.delete_confirm')}<br />{text('generic.action_irreversible')}</p>
			</FormDialog>
		{/each}

		<button onclick={() => createPasskey(user.id).then(passkeys.push.bind(passkeys))} class="inline-button icon-text">
			<Icon i="plus" />
			{text('page.account.passkeys.create')}
		</button>
	</div>

	<div id="sessions" class="section main">
		<h3>{text('page.account.sessions')}</h3>
		<SessionList {sessions} {currentSession} {user} redirectAfterLogoutAll />
	</div>

	<div id="preferences" class="section main">
		<h3>{text('page.account.preferences')}</h3>
		<ZodForm
			bind:rootValue={user.preferences}
			idPrefix="preferences"
			schema={Preferences}
			labels={preferenceLabels}
			updateValue={(preferences: Preferences) => fetchAPI('PATCH', 'users/:id', { preferences }, user.id)}
		/>
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
