<script lang="ts">
	import { text } from '@axium/client';
	import type { UserPublic } from '@axium/core/user';
	import UserPFP from './UserPFP.svelte';

	const {
		user,
		compact = false,
		self = false,
		href,
		you = false,
	}: {
		user: UserPublic;
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
		<UserPFP {user} />
	{/if}
	{user.name}
	{#if self && you}
		<span class="subtle">{text('UserCard.you')}</span>
	{/if}
</a>

<style>
	.User {
		cursor: pointer;
		width: max-content;
		height: max-content;
	}
</style>
