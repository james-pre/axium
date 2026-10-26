<script lang="ts">
	import { addToACL, getACL, removeFromACL, text, updateACL, userInfo } from '@axium/client';
	import type { AccessControl, AccessControllable, UserPublic } from '@axium/core';
	import { checkAndMatchACL, getTarget, impliedPermissions, pickPermissions, resolvePermissions } from '@axium/core';
	import { getAccessControlConfig } from '@axium/core/plugins';
	import type { HTMLDialogAttributes } from 'svelte/elements';
	import Discovery, * as discovery from './Discovery.svelte';
	import FormDialog from './FormDialog.svelte';
	import Icon from './Icon.svelte';
	import UserCard from './UserCard.svelte';
	import { closeOnBackGesture } from './attachments/gestures.js';
	import { confirm } from './dialogs.js';
	import { toast } from './toast.js';

	interface Props extends HTMLDialogAttributes {
		user?: UserPublic;
		dialog?: HTMLDialogElement;
		itemType: string;
		item: { name?: string; user?: UserPublic; id: string } & AccessControllable;
	}
	let { item, itemType, user, dialog = $bindable(), ...rest }: Props = $props();

	const acl = $state(item.acl ?? (await getACL(itemType, item.id)));

	const config = $derived(getAccessControlConfig(itemType));
	const presets = $derived(Object.keys(config?.presets ?? {}));

	const editable = $derived(!!user && (item.userId === user.id || !checkAndMatchACL(acl, user, { manage: true }).size));

	let customDialog = $state<HTMLDialogElement>(),
		customizing = $state<AccessControl>(),
		draft = $state<Record<string, boolean>>({});

	function permissionNames(control: AccessControl): string[] {
		return Object.keys(config?.permissions ?? pickPermissions(control));
	}

	function presetOf(control: AccessControl): string | undefined {
		return Object.entries(config?.presets ?? {}).find(([, granted]) =>
			permissionNames(control).every(name => !!control[name] == granted.includes(name))
		)?.[0];
	}

	/** Whether a permission is granted because another granted permission implies it */
	function isImplied(permissions: Record<string, unknown>, name: string): boolean {
		if (!config) return false;
		return Object.keys(permissions).some(other => other != name && permissions[other] && impliedPermissions(config, other).has(name));
	}

	function permissionText(name: string): string {
		return text(`permission.${itemType}.${name}`, { $default: name });
	}

	function presetText(name: string): string {
		return text(`preset.${itemType}.${name}`, { $default: name });
	}

	function summary(control: AccessControl): string {
		const preset = presetOf(control);
		if (preset) return presetText(preset);
		const granted = permissionNames(control).filter(name => control[name]);
		return granted.length ? granted.map(permissionText).join(', ') : text('AccessControlDialog.no_access');
	}

	async function update(control: AccessControl, permissions: Record<string, boolean>) {
		Object.assign(control, await updateACL(itemType, item.id, getTarget(control), permissions));
	}

	function customize(control: AccessControl) {
		customizing = control;
		draft = Object.fromEntries(permissionNames(control).map(name => [name, !!control[name]]));
		customDialog?.showModal();
	}
</script>

<dialog bind:this={dialog} {...rest} onclick={e => e.stopPropagation()} {@attach closeOnBackGesture}>
	{#if item.name}
		<h3>{@html text('AccessControlDialog.named_title', { $html: true, name: item.name })}</h3>
	{:else}
		<h3>{text('AccessControlDialog.title')}</h3>
	{/if}

	<div class="entries">
		<div class="AccessControl">
			<div class="target">
				{#if item.user}
					<UserCard user={item.user} self={item.userId == user?.id} you />
				{:else}
					{#await userInfo(item.userId) then owner}
						<UserCard user={owner} self={item.userId == user?.id} you />
					{:catch}
						<i>{text('generic.unknown')}</i>
					{/await}
				{/if}
			</div>
			<span class="access">{text('AccessControlDialog.owner')}</span>
		</div>

		{#each acl as control (getTarget(control))}
			{const preset = $derived(presetOf(control))}
			<div class="AccessControl">
				<div class="target">
					{#if control.userId}
						<UserCard user={(control.user ||= await userInfo(control.userId))} self={control.userId == user?.id} you />
					{:else if control.role}
						<span class="icon-text">
							<Icon i="at" />
							<span>{control.role}</span>
						</span>
					{:else if control.tag}
						<span class="icon-text">
							<Icon i="hashtag" />
							<span>{control.tag}</span>
						</span>
					{:else}
						<span class="icon-text">
							<Icon i="globe" />
							<span>{text('AccessControlDialog.public_target')}</span>
						</span>
					{/if}
				</div>

				{#if !editable}
					<span class="access">{summary(control)}</span>
				{:else if presets.length}
					<select
						class="access"
						value={preset ?? ''}
						onchange={async event => {
							const select = event.currentTarget;

							if (select.value == 'custom') {
								select.value = preset ?? '';
								customize(control);
								return;
							}

							const granted = config!.presets[select.value];
							try {
								await update(
									control,
									Object.fromEntries(permissionNames(control).map(name => [name, granted.includes(name)]))
								);
							} catch (error) {
								select.value = presetOf(control) ?? '';
								await toast('error', error);
							}
						}}
					>
						{#each presets as name}
							<option value={name}>{presetText(name)}</option>
						{/each}
						{#if !preset}
							<option value="" disabled>{summary(control)}</option>
						{/if}
						{#if !config?.force_presets}
							<option value="custom">{text('AccessControlDialog.customize')}</option>
						{/if}
					</select>
				{:else}
					<button class="access" onclick={() => customize(control)}>{summary(control)}</button>
				{/if}

				{#if editable}
					<button
						class="reset remove"
						title={text('AccessControlDialog.remove')}
						onclick={async () => {
							const target = getTarget(control);

							if (
								control.userId == user?.id &&
								!(await confirm(text('AccessControlDialog.remove_self_confirm'), {
									danger: true,
									confirmText: text('AccessControlDialog.remove'),
								}))
							)
								return;

							try {
								await removeFromACL(itemType, item.id, target);
								acl.splice(
									acl.findIndex(other => getTarget(other) == target),
									1
								);
								await toast('success', text('AccessControlDialog.toast_removed'));
							} catch (error) {
								await toast('error', error);
							}
						}}
					>
						<Icon i="trash" />
					</button>
				{/if}
			</div>
		{/each}
	</div>

	{#if editable}
		<Discovery
			onSelect={async ({ target }) => {
				try {
					const control = await addToACL(itemType, item.id, target);
					if (control.userId) control.user = await userInfo(control.userId);
					acl.push(control);
				} catch (e) {
					await toast('error', e);
				}
			}}
			sources={[discovery.user, discovery.role]}
			exclude={result =>
				acl
					.map(getTarget)
					.filter<string>((t): t is string => !!t)
					.includes(result.target)}
			placeholder={text('AccessControlDialog.placeholder')}
		/>

		{#if !acl.some(control => getTarget(control) === null)}
			<div>
				<button
					class="icon-text"
					onclick={() =>
						addToACL(itemType, item.id, null)
							.then(control => acl.push(control))
							.catch(e => toast('error', e))}
				>
					<Icon i="globe" />
					<span>{text('AccessControlDialog.add_public')}</span>
				</button>
			</div>
		{/if}
	{/if}

	<div>
		<button class="done" onclick={() => dialog!.close()}>{text('generic.done')}</button>
	</div>
</dialog>

<FormDialog bind:dialog={customDialog} submitText={text('AccessControlDialog.save')} submit={() => update(customizing!, draft)}>
	{#snippet header()}
		<h3>{text('AccessControlDialog.custom_title')}</h3>
	{/snippet}

	<div class="permissions">
		{#each Object.keys(draft) as name}
			{const id = `${item.id}.custom.${name}`}
			{const implied = $derived(isImplied(draft, name))}
			<span class="icon-text">
				<input
					{id}
					type="checkbox"
					checked={draft[name]}
					disabled={implied}
					onchange={event => {
						const { checked } = event.currentTarget;
						if (config) Object.assign(draft, resolvePermissions(config, { [name]: checked }));
						else draft[name] = checked;
					}}
				/>
				<label for={id} class={['checkbox', implied && 'disabled']}>
					{#if draft[name]}<Icon i="check" --size="1.3em" />{/if}
				</label>
				<label for={id}>{permissionText(name)}</label>
			</span>
		{/each}
	</div>
</FormDialog>

<style>
	dialog:open {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.done {
		float: right;
	}

	.entries {
		display: grid;
		grid-template-columns: 1fr auto 2em;

		@media (width > 700px) {
			min-width: 30em;
		}
	}

	.AccessControl {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		gap: 1em;
		padding: 0.75em 1em;
		border-bottom: var(--border-accent);
	}

	.remove {
		display: contents;
	}

	.permissions {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		max-height: 60vh;
		overflow-y: auto;
	}
</style>
