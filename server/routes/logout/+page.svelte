<script lang="ts">
	import { goto } from '$app/navigation';
	import { logoutCurrentSession } from '@axium/client/user';
</script>

<svelte:head>
	<title>Logout</title>
</svelte:head>

<div class="main">
	<p>Are you sure you want to log out?</p>
	<button onclick={() => logoutCurrentSession().finally(() => goto('/'))}>Log Out</button>
</div>
