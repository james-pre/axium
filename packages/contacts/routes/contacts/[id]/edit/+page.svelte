<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { toast } from '@axium/client/toast';
	import { Init } from '@axium/contacts';
	import { InitForm } from '@axium/contacts/components';

	const { data } = $props();

	let init = $state<Init>(data.contact);

	async function save() {
		try {
			const contact = await fetchAPI('PATCH', 'contacts/:id', init, data.contact.id);
			location.pathname = '/contacts/' + contact.id;
		} catch (e) {
			await toast('error', e);
		}
	}
</script>

<svelte:head>
	<title>{text('contacts.edit_title')}</title>
</svelte:head>

<InitForm bind:init {save} back="/contacts/{data.contact.id}" />
