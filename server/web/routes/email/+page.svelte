<script lang="ts">
	import { enhance } from '$app/forms';
	import '../../lib/styles.css';
	let { form, data } = $props();
</script>

<svelte:head>
	<title>Edit Email</title>
</svelte:head>

<div class="EditEmail">
	<form method="POST" class="main" use:enhance>
		{#if form?.error}
			<div class="error">
				{typeof form.error === 'string' ? form.error : JSON.stringify(form.error)}
			</div>
		{/if}
		<div>
			<label for="email">Email Address</label>
			<input name="email" type="email" value={form?.email || data.session.user.email || ''} required />
		</div>
		<button type="submit">Continue</button>
	</form>
</div>
