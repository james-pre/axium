<script lang="ts">
	import type { User } from '@axium/core/user';
	import { getUserImage } from '@axium/core';

	const {
		user,
		compact = false,
		self = false,
		href = `/users/${user.id}`,
		you = false,
	}: {
		user: Partial<User>;
		/** If true, don't show the picture */
		compact?: boolean;
		/** Whether the user is viewing their own profile */
		self?: boolean;
		/** The URL to link to */
		href?: string;
		/** Whether to display a "You" label if `self` */
		you?: boolean;
	} = $props();
</script>

<a class={['User', self && 'self']} {href}>
	{#if !compact}
		<img src={getUserImage(user)} alt={user.name} />
	{/if}
	{user.name}
	{#if self && you}
		<span class="subtle">(You)</span>
	{/if}
</a>

<style>
	.User {
		cursor: pointer;
		width: max-content;
		height: max-content;
	}

	img {
		width: 2em;
		height: 2em;
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 0.5em;
	}
</style>
