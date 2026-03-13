<script lang="ts">
	import { addToACL, getACL, removeFromACL, text, updateACL, userInfo } from '@axium/client';
	import type { AccessControllable, AccessTarget, User } from '@axium/core';
	import { getTarget, pickPermissions } from '@axium/core';
	import { errorText } from '@axium/core/io';
	import type { HTMLDialogAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import UserCard from './UserCard.svelte';
	import UserDiscovery from './UserDiscovery.svelte';
	import { closeOnBackGesture } from './attachments.js';
	import { toastStatus } from './toast.js';

	interface Props extends HTMLDialogAttributes {
		editable: boolean;
		dialog?: HTMLDialogElement;
		itemType: string;
		item: { name?: string; user?: User; id: string } & AccessControllable;
	}
	let { item, itemType, editable, dialog = $bindable(), ...rest }: Props = $props();

	let error = $state<string>();

	const acl = $state(item.acl ?? (await getACL(itemType, item.id)));

	async function onSelect(target: AccessTarget) {
		const control = await addToACL(itemType, item.id, target);
		if (control.userId) control.user = await userInfo(control.userId);
		acl.push(control);
	}
</script>

<dialog bind:this={dialog} {...rest} onclick={e => e.stopPropagation()} {@attach closeOnBackGesture}>
	{#if item.name}
		<h3>{@html text('AccessControlDialog.named_title', { $html: true, name: item.name })}</h3>
	{:else}
		<h3>{text('AccessControlDialog.title')}</h3>
	{/if}

	{#if error}
		<div class="error">{error}</div>
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
				error = errorText(e);
			}
		}}
		<div class="AccessControl">
			<div class="target">
				{#if control.user}
					<UserCard user={control.user} />
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
					<i>{text('generic.unknown')}</i>
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

	<UserDiscovery {onSelect} excludeTargets={acl.map(getTarget)} />

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
