<script lang="ts">
	import { text } from '@axium/client';
	import '@axium/client/styles/list';
	import type { Contact } from '@axium/contacts';
	import * as format from '@axium/contacts/format';

	const { contacts }: { contacts: Contact[] } = $props();
</script>

<div class="list">
	<div class="list-item list-header">
		<span></span>
		<span>{text('contacts.list.name')}</span>
		<span>{text('contacts.list.email')}</span>
		<span>{text('contacts.list.phone')}</span>
		<span>{text('contacts.list.job')}</span>
	</div>

	{#each contacts as contact (contact.id)}
		<div class="list-item" onclick={() => (location.href = `/contacts/${contact.id}`)}>
			<span>{format.name(contact)}</span>
			<span>{format.emailDefault(contact)}</span>
			<span>{format.phoneDefault(contact)}</span>
			<span>{format.job(contact)}</span>
		</div>
	{:else}
		<p class="list-empty">{text('contacts.list.empty')}</p>
	{/each}
</div>

<style>
	.list-item {
		grid-template-columns: 2em 2fr minmax(10em, 25em) minmax(10em, 20em) 1fr;
	}
</style>
