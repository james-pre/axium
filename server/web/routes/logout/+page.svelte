<script lang="ts">
	import { fetchAPI } from '@axium/core/requests';

	async function onclick() {
		const session = await fetchAPI('GET', '/api/session');

		await fetchAPI('POST', '/api/logout', { session });
	}
</script>

<svelte:head>
	<title>Logout</title>
</svelte:head>

<div class="main">
	<p>Are you sure you want to log out?</p>
	<button {onclick}>Log Out</button>
</div>
