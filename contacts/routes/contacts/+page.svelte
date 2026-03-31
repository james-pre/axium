<script lang="ts">
	import { List as ContactList } from '@axium/contacts/components';

	const { data } = $props();
</script>

<ContactList contacts={data.contacts} />

<style>
</style>
