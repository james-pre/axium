<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div>
	<form method="POST" class="main" use:enhance>
		{#if form?.error}
			<div class="error">
				{typeof form.error === 'string' ? form.error : JSON.stringify(form.error)}
			</div>
		{/if}
		<div>
			<label for="name">Display Name</label>
			<input name="name" type="text" value={form?.name || ''} required />
		</div>
		<div>
			<label for="email">Email</label>
			<input name="email" type="email" value={form?.email || ''} required />
		</div>
		<div>
			<label for="password">Password</label>
			<input name="password" type="password" />
		</div>
		<button type="submit">Register</button>
	</form>
</div>
