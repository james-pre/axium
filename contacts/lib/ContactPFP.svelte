<script lang="ts">
	import type { NoExternal } from '@axium/contacts';
	import { colorHashRGB } from '@axium/core/color';
	import { name as formatName } from '@axium/contacts/format';
	import UserPFP from '@axium/client/components/UserPFP';
	import { userInfo } from '@axium/client';

	let { contact, isDefault = $bindable() }: { contact: NoExternal; isDefault?: boolean } = $props();

	const name = $derived(formatName(contact));

	const defaultImage = $derived(
		`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" style="background-color:${colorHashRGB(name ?? '\0')};display:flex;align-items:center;justify-content:center;">
		<text x="23" y="28" style="font-family:sans-serif;font-weight:bold;" fill="white">${(name.replaceAll(/\W/g, '') || '?')[0]}</text>
	</svg>`.replaceAll(/[\t\n]/g, '')
	);

	let src = $state(`/raw/contacts/pfp/${contact.id}`);

	$effect(() => {
		// Reset the attempted source when the user changes
		src = `/raw/contacts/pfp/${contact.id}`;
	});
</script>

{#if contact.linkedUserId}
	<UserPFP user={await userInfo(contact.linkedUserId)} bind:isDefault />
{:else}
	<img
		class="ContactPFP"
		{src}
		alt={name}
		onerror={() => {
			isDefault = true;
			src = defaultImage;
		}}
	/>
{/if}

<style>
	img.ContactPFP {
		width: var(--size, 2em);
		height: var(--size, 2em);
		border-radius: 50%;
		border: 1px solid #8888;
		vertical-align: middle;
		margin-right: 0.5em;
		/* see https://drafts.csswg.org/css-image-animation-1/ */
		image-animation: stopped;
	}
</style>
