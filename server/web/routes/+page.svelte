<script lang="ts">
	import Account from '../lib/Account.svelte';
	const { data, form } = $props();
</script>

<svelte:head>
	<title>Account</title>
</svelte:head>

<Account {data} {form}></Account>
