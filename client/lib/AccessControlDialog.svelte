<script lang="ts">
	import { addToACL, getACL, removeFromACL, text, updateACL, userInfo } from '@axium/client';
	import type { AccessControllable, AccessTarget, UserPublic } from '@axium/core';
	import { checkAndMatchACL, getTarget, pickPermissions } from '@axium/core';
	import type { HTMLDialogAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import UserCard from './UserCard.svelte';
	import UserDiscovery from './UserDiscovery.svelte';
	import { closeOnBackGesture } from './attachments.js';
	import { toast, toastStatus } from './toast.js';

	interface Props extends HTMLDialogAttributes {
		user?: UserPublic;
		dialog?: HTMLDialogElement;
		itemType: string;
		item: { name?: string; user?: UserPublic; id: string } & AccessControllable;
	}
	let { item, itemType, user, dialog = $bindable(), ...rest }: Props = $props();

	const acl = $state(item.acl ?? (await getACL(itemType, item.id)));

	const editable = $derived(!!user && (item.userId === user.id || !checkAndMatchACL(item.acl || [], user, { manage: true }).size));
</script>

<dialog bind:this={dialog} {...rest} onclick={e => e.stopPropagation()} {@attach closeOnBackGesture}>
	{#if item.name}
		<h3>{@html text('AccessControlDialog.named_title', { $html: true, name: item.name })}</h3>
	{:else}
		<h3>{text('AccessControlDialog.title')}</h3>
	{/if}

	<div class="AccessControl text">
		{#if item.user}
			<UserCard user={item.user} />
		{:else if item}
			{#await userInfo(item.userId) then user}<UserCard {user} />{:catch}<i>{text('generic.unknown')}</i>{/await}
		{/if}
		<span>{text('AccessControlDialog.owner')}</span>
	</div>

	{#each acl as control, i (control.userId || control.role || control.tag)}
		{@const update = (key: string) => async (e: Event & { currentTarget: HTMLInputElement }) => {
			try {
				const updated = await updateACL(itemType, item.id, getTarget(control), { [key]: e.currentTarget.checked });
				Object.assign(control, updated);
			} catch (e) {
				toast('error', e);
			}
		}}
		<div class="AccessControl">
			<div class="target">
				{#if control.userId}
					<UserCard user={(control.user ||= await userInfo(control.userId))} />
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
					<span>{text('AccessControlDialog.public_target')}</span>
				{/if}
				{#if editable}
					<button
						class="icon-text danger"
						onclick={() =>
							toastStatus(
								removeFromACL(itemType, item.id, getTarget(control)).then(() => acl.splice(i, 1)),
								text('AccessControlDialog.toast_removed')
							)}
					>
						<Icon i="user-minus" />
						<span>{text('AccessControlDialog.remove')}</span>
					</button>
				{/if}
			</div>
			<div class="permissions">
				{#each Object.entries(pickPermissions(control) as Record<string, boolean>) as [key, value]}
					{@const id = `${item.id}.${getTarget(control)}.${key}`}
					<span class="icon-text">
						{#if editable}
							<input {id} type="checkbox" onchange={update(key)} />
							<label for={id} class="checkbox">
								{#if value}<Icon i="check" --size="1.3em" />{/if}
							</label>
						{:else}
							<Icon i={value ? 'check' : 'xmark'} />
						{/if}
						<span>{text(`permission.${itemType}.${key}`, { $default: key })}</span>
					</span>
				{/each}
			</div>
		</div>
	{/each}

	{#if editable}
		<div class="actions">
			{#if !acl.find(c => !c.userId && !c.role && !c.tag)}
				<button
					class="icon-text"
					onclick={() =>
						addToACL(itemType, item.id, null)
							.then(ac => acl.push(ac))
							.catch(e => toast('error', e))}
				>
					<Icon i="globe" />
					<span>{text('AccessControlDialog.add_public')}</span>
				</button>
			{/if}
		</div>
		<UserDiscovery
			onSelect={async (target: AccessTarget) => {
				try {
					const control = await addToACL(itemType, item.id, target);
					if (control.userId) control.user = await userInfo(control.userId);
					acl.push(control);
				} catch (e) {
					toast('error', e);
				}
			}}
			excludeTargets={acl.map(getTarget).filter<string>((t): t is string => !!t)}
		/>
	{/if}

	<div>
		<button class="done" onclick={() => dialog!.close()}>{text('generic.done')}</button>
	</div>
</dialog>

<style>
	dialog:open {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.done {
		float: right;
	}

	.permissions {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
	}

	.actions {
		display: flex;
		gap: 1em;
		align-items: center;
	}

	.AccessControl {
		display: grid;
		gap: 1em;
		grid-template-columns: 1fr 1fr;
		padding: 1em 2em;
		border-bottom: var(--border-accent);

		&.text {
			align-items: center;
		}

		.target {
			display: flex;
			flex-direction: column;
			justify-content: space-around;
			gap: 1em;
		}

		@media (width > 700px) {
			min-width: 30em;
		}
	}
</style>
