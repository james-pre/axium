<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	const { user } = page.data.session;
	let { form } = $props();
</script>

<svelte:head>
	<title>Edit Email</title>
</svelte:head>

<div>
	<form method="POST" class="main" use:enhance>
		{#if form?.error}
			<div class="error">
				{typeof form.error === 'string' ? form.error : JSON.stringify(form.error)}
			</div>
		{/if}
		<div>
			<label for="email">Email Address</label>
			<input name="email" type="email" value={form?.email || user.email || ''} required />
		</div>
		<button type="submit">Continue</button>
	</form>
</div>
