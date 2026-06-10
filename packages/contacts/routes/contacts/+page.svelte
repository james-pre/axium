<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { List as ContactList } from '@axium/contacts/components';

	const { data } = $props();
</script>

<svelte:head>
	<title>{text('app_name.contacts')}</title>
</svelte:head>

<div class="contact-list-container">
	<div>
		<a href="/contacts/new">
			<button class="icon-text">
				<Icon i="plus" />
				<span>{text('contacts.new_button')}</span>
			</button>
		</a>
	</div>
	<ContactList contacts={data.contacts} />
</div>

<style>
	.contact-list-container {
		margin: 2em;
	}
</style>
