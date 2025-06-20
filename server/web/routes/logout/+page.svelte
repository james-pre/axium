<script lang="ts">
	async function onclick() {
		const response = await fetch('/api/session', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		const session = await response.json();

		await fetch('/api/logout', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(session),
		});
	}
</script>

<svelte:head>
	<title>Logout</title>
</svelte:head>

<div class="main">
	<p>Are you sure you want to log out?</p>
	<button {onclick}>Log Out</button>
</div>
