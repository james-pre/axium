<script lang="ts">
	import { addToACL, getACL, updateACL } from '@axium/client/access';
	import { userInfo } from '@axium/client/user';
	import type { AccessControllable, AccessTarget, User } from '@axium/core';
	import { getTarget, pickPermissions } from '@axium/core/access';
	import { errorText } from '@axium/core/io';
	import type { HTMLDialogAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import UserCard from './UserCard.svelte';
	import UserDiscovery from './UserDiscovery.svelte';

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

<dialog bind:this={dialog} {...rest}>
	{#if item.name}
		<h3>Permissions for <strong>{item.name}</strong></h3>
	{:else}
		<h3>Permissions</h3>
	{/if}

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<div class="AccessControl">
		{#if item.user}
			<UserCard user={item.user} />
		{:else if item}
			{#await userInfo(item.userId) then user}<UserCard {user} />{/await}
		{/if}
		<span>Owner</span>
	</div>

	{#each acl as control}
		{@const update = (key: string) => async (e: Event & { currentTarget: HTMLInputElement }) => {
			try {
				const updated = await updateACL(itemType, item.id, getTarget(control), { [key]: e.currentTarget.checked });
				Object.assign(control, updated);
			} catch (e) {
				error = errorText(e);
			}
		}}
		<div class="AccessControl">
			{#if control.user}
				<UserCard user={control.user} />
			{:else if control.role}
				<span class="icon-text">
					<Icon i="at" />
					<span>{control.role}</span>
				</span>
			{:else}
				<i>Unknown</i>
			{/if}
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
						<span>{key}</span>
					</span>
				{/each}
			</div>
		</div>
	{/each}

	<UserDiscovery {onSelect} excludeTargets={acl.map(getTarget)} />

	<div>
		<button class="done" onclick={() => dialog!.close()}>Done</button>
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
		grid-template-columns: 1fr 10em;
		min-width: 30em;
		padding: 1em 2em;

		&:not(.public) {
			border-bottom: 1px solid var(--border-accent);
		}
	}
</style>
