<script lang="ts">
	import { addToACL, getACL, updateACL } from '@axium/client/access';
	import { userInfo } from '@axium/client/user';
	import type { AccessControl, AccessControllable, AccessTarget, User } from '@axium/core';
	import { getTarget, pickPermissions } from '@axium/core/access';
	import type { HTMLDialogAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import UserCard from './UserCard.svelte';
	import UserDiscovery from './UserDiscovery.svelte';
	import { errorText } from '@axium/core/io';

	interface Props extends HTMLDialogAttributes {
		editable: boolean;
		dialog?: HTMLDialogElement;
		itemType: string;
		item: { name?: string; user?: User; id: string } & AccessControllable;
		acl?: AccessControl[];
	}
	let { item, itemType, editable, dialog = $bindable(), acl = item.acl, ...rest }: Props = $props();

	let error = $state<string>();

	acl ||= await getACL(itemType, item.id);

	async function onSelect(target: AccessTarget) {
		const control = await addToACL(itemType, item.id, target);
		acl!.push(control);
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
		<div class="AccessControl">
			{#if control.user}
				<UserCard user={control.user} />
			{:else if control.role}
				<span class="icon-text">
					<Icon i="at" />
					<span>{control.role}</span>
				</span>
				<!-- {:else if control.tag} -->
			{:else}
				<i>Unknown</i>
			{/if}
			{#if editable}
				<select
					multiple
					onchange={event =>
						updateACL(
							itemType,
							item.id,
							getTarget(control),
							Object.fromEntries(Array.from(event.currentTarget.selectedOptions).map(k => [k.value, true])) as any
						).catch(e => (error = errorText(e)))}
				>
					{#each Object.entries(pickPermissions(control)) as [key, value]}
						<option value={key} selected={!!value}>{key}</option>
					{/each}
				</select>
			{:else}
				<span
					>{Object.entries(pickPermissions(control))
						.filter(([, value]) => value)
						.map(([key]) => key)
						.join(', ')}</span
				>
			{/if}
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
