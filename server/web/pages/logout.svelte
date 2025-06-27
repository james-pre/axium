<script lang="ts">
	import { logout } from '@axium/client/user';
</script>

<svelte:head>
	<title>Logout</title>
</svelte:head>

<div class="main">
	<p>Are you sure you want to log out?</p>
	<button onclick={logout}>Log Out</button>
</div>
