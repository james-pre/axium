<script lang="ts">
	import { getACL, setACL } from '@axium/client/access';
	import { userInfo } from '@axium/client/user';
	import type { AccessMap, User } from '@axium/core';
	import { pickPermissions, type AccessControl, type AccessControllable } from '@axium/core/access';
	import FormDialog from './FormDialog.svelte';
	import UserCard from './UserCard.svelte';
	import Icon from './Icon.svelte';
	import type { HTMLDialogAttributes } from 'svelte/elements';

	interface Props extends HTMLDialogAttributes {
		editable: boolean;
		dialog?: HTMLDialogElement;
		itemType: string;
		item?: ({ name?: string; user?: User; id: string } & AccessControllable) | null;
		acl?: AccessControl[];
	}
	let { item = $bindable(), itemType, editable, dialog = $bindable(), acl = $bindable(item?.acl), ...rest }: Props = $props();

	if (!acl && item) getACL(itemType, item.id).then(fetched => (acl = item.acl = fetched));
</script>

<FormDialog
	bind:dialog
	submitText="Save"
	submit={async data => {
		if (item) await setACL(itemType, item.id, data as any as AccessMap);
	}}
	{...rest}
>
	{#snippet header()}
		{#if item?.name}
			<h3>Permissions for <strong>{item.name}</strong></h3>
		{:else}
			<h3>Permissions</h3>
		{/if}
	{/snippet}

	<div class="AccessControl">
		{#if item?.user}
			<UserCard user={item.user} />
		{:else if item}
			{#await userInfo(item.userId) then user}<UserCard {user} />{/await}
		{/if}
		<span>Owner</span>
	</div>

	{#each acl ?? [] as control}
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
				<select name={control.userId ?? (control.role ? '@' + control.role : 'public')} multiple>
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
</FormDialog>

<style>
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
