<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon } from '@axium/client/components';
	import { createPasskey, deletePasskey, updatePasskey } from '@axium/client/user';
	import type { Passkey } from '@axium/core';

	const { passkeys: initial, userId }: { passkeys: Passkey[]; userId: string } = $props();

	let passkeys = $state(initial);
</script>

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
				<span>{passkey.name}</span>
			{:else}
				<span class="subtle"><i>{text('generic.unnamed')}</i></span>
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

<button onclick={() => createPasskey(userId).then(passkeys.push.bind(passkeys))} class="inline-button icon-text">
	<Icon i="plus" />
	{text('page.account.passkeys.create')}
</button>
