<script lang="ts">
	import { enhance } from '$app/forms';
	import '../../lib/styles.css';
	let { form, data } = $props();
	const { user } = data.session;
</script>

<svelte:head>
	<title>Edit Name</title>
</svelte:head>

<div class="EditName">
	<form method="POST" class="main" use:enhance>
		{#if form?.error}
			<div class="error">
				{typeof form.error === 'string' ? form.error : JSON.stringify(form.error)}
			</div>
		{/if}
		<div>
			<label for="name">What do you want to be called?</label>
			<input name="name" type="text" value={form?.name || user.name || ''} required />
		</div>
		<button type="submit">Continue</button>
	</form>
</div>
