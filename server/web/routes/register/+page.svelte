<script lang="ts">
	import { goto } from '$app/navigation';
	import SignUp from '../../lib/SignUp.svelte';
	import '../../lib/styles.css';
	let { form } = $props();
	$effect(() => {
		if (form?.success) goto('/');
	});
</script>

<svelte:head>
	<title>Sign Up</title>
</svelte:head>

<SignUp {form} />
