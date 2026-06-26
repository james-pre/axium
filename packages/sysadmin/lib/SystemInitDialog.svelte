<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { FormDialog } from '@axium/client/components';
	import { SystemInit, SystemType, type System } from '@axium/sysadmin';

	let {
		dialog = $bindable(),
		userId,
		system,
		created,
		edited,
	}: {
		/** The dialog element, for triggering programmatically (e.g. an edit action) */
		dialog?: HTMLDialogElement;
		/** The user the system is created for (used in create mode) */
		userId?: string;
		/** An existing system to edit. When set, the dialog operates in edit mode. */
		system?: System;
		/** Called with the newly created system (create mode) */
		created?(system: System): unknown;
		/** Called with the updated system (edit mode) */
		edited?(system: System): unknown;
	} = $props();

	const types = SystemType.def.values;
</script>

<FormDialog
	id={system ? undefined : 'system-init'}
	bind:dialog
	submitText={system ? text('sysadmin.SystemInitDialog.save') : text('sysadmin.SystemInitDialog.submit')}
	submit={async raw => {
		const init = SystemInit.parse(raw);
		if (system) {
			const updated = await fetchAPI('PATCH', 'sysadmin/systems/:id', init, system.id);
			await edited?.(updated);
		} else {
			const created_ = await fetchAPI('PUT', 'users/:id/sysadmin/systems', init, userId!);
			await created?.(created_);
		}
	}}
>
	<div>
		<label for="name">{text('sysadmin.SystemInitDialog.name')}</label>
		<input name="name" type="text" required value={system?.name ?? ''} />
	</div>
	<div>
		<label for="hostname">{text('sysadmin.SystemInitDialog.hostname')}</label>
		<input name="hostname" type="text" required value={system?.hostname ?? ''} />
	</div>
	<div>
		<label for="type">{text('sysadmin.SystemInitDialog.type')}</label>
		<select name="type" value={system?.type ?? 'server'}>
			{#each types as type}
				<option value={type}>{text(`sysadmin.system_type.${type}`)}</option>
			{/each}
		</select>
	</div>
</FormDialog>
