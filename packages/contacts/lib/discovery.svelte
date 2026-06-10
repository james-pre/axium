<script lang="ts" module>
	import type { discovery } from '@axium/client/components';
	import { fetchAPI } from '@axium/client/requests';
	import type { NoExternal } from '@axium/contacts';
	import { format } from '@axium/contacts/client';

	export const contactDiscovery: discovery.Source<{ contact: NoExternal }> = {
		name: 'contact',
		async get(search) {
			const contacts = await fetchAPI('POST', 'contact-discovery', search);
			return contacts.map(contact => ({ contact }));
		},
		get render() {
			return renderContact;
		},
	};
</script>

{#snippet renderContact(result: { contact: NoExternal })}
	<span>{format.name(result.contact)}</span>
{/snippet}
