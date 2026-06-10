<script lang="ts">
	import type { NoExternal } from '@axium/contacts';
	import { format } from '@axium/contacts/client';

	const { contact, compact }: { contact: NoExternal; compact?: boolean } = $props();

	const name = format.name(contact);
</script>

<a href="/contacts/{contact.id}">{name}</a>

<!-- @todo show expanded card on hover
	<div class="ContactCard">
		<ContactPicture {contact} />
		<h3>{name}</h3>
		<span>{format.emailDefault(contact)}</span>
	</div>
-->

<style>
</style>
