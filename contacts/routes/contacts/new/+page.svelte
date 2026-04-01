<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { toast } from '@axium/client/toast';
	import { Init } from '@axium/contacts';
	import { InitForm } from '@axium/contacts/components';

	const { data } = $props();

	let init = $state<Init>({
		emails: [],
		phones: [],
		addresses: [],
		relationships: [],
		urls: [],
		dates: [],
		custom: [],
	});

	async function save() {
		try {
			const contact = await fetchAPI('PUT', 'users/:id/contacts', init, data.session.userId);
			location.pathname = '/contacts/' + contact.id;
		} catch (e) {
			await toast('error', e);
		}
	}
</script>

<svelte:head>
	<title>{text('contacts.init.title')}</title>
</svelte:head>

<InitForm bind:init {save} />
