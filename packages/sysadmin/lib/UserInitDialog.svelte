<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { FormDialog } from '@axium/client/components';
	import { SystemUserInit, type SystemUser } from '@axium/sysadmin';

	let {
		dialog = $bindable(),
		userId,
		user,
		created,
		edited,
	}: {
		/** The dialog element, for triggering programmatically (e.g. an edit action) */
		dialog?: HTMLDialogElement;
		/** The user the system user is created for (used in create mode) */
		userId?: string;
		/** An existing system user to edit. When set, the dialog operates in edit mode. */
		user?: SystemUser;
		/** Called with the newly created system user (create mode) */
		created?(user: SystemUser): unknown;
		/** Called with the updated system user (edit mode) */
		edited?(user: SystemUser): unknown;
	} = $props();
</script>

<FormDialog
	id={user ? undefined : 'system-user-init'}
	bind:dialog
	submitText={user ? text('sysadmin.UserInitDialog.save') : text('sysadmin.UserInitDialog.submit')}
	submit={async raw => {
		const init = SystemUserInit.parse(raw);
		if (user) {
			const updated = await fetchAPI('PATCH', 'sysadmin/users/:id', init, user.id);
			await edited?.(updated);
		} else {
			const created_ = await fetchAPI('PUT', 'users/:id/sysadmin/users', init, userId!);
			await created?.(created_);
		}
	}}
>
	<div>
		<label for="name">{text('sysadmin.UserInitDialog.name')}</label>
		<input name="name" type="text" required value={user?.name ?? ''} />
	</div>
	<div>
		<label for="username">{text('sysadmin.UserInitDialog.username')}</label>
		<input name="username" type="text" required value={user?.username ?? ''} />
	</div>
</FormDialog>
