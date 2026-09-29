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
	<div class="contacts">
		<ContactList contacts={data.contacts} />
	</div>
</div>

<style>
	.contact-list-container {
		margin: 2em;
	}

	.contacts {
		margin-top: 1em;
		padding: 0 1em;
		border-radius: 1em;
		background-color: var(--bg-menu);
	}
</style>
