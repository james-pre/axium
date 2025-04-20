<script lang="ts">
	import type { Permission } from '../dist/common.js';
	import { permissionNames } from '../dist/common.js';
	import type { Entries } from 'utilium';
	import { UserCard } from '@axium/server/web';
	import type { Share } from '../dist/common.js';

	const { share, editable }: { share: Share; editable: boolean } = $props();

	const perm = $derived(permissionNames[share.permission as Permission]);

	const permEntries = Object.entries(permissionNames) as any as Entries<typeof permissionNames>;
</script>

<div class="Share">
	{#if !share.user}<i>Unknown</i>
	{:else}
		<UserCard user={share.user} />
		{#if editable}
			<input type="hidden" name="userId" value={share.user.id} />
			<select name="permission">
				{#each permEntries as [key, name]}
					<option value={key} selected={key == share.permission}>{name}</option>
				{/each}
			</select>
		{:else}
			<span>{perm}</span>
		{/if}
	{/if}
</div>

<style>
	.Share {
		display: flex;
		gap: 1em;
		padding: 1em 2em;
	}
</style>
