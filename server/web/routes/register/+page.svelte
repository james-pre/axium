<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<div>
	<form method="POST" class="main">
		{#if form?.error}
			<div id="error">
				{typeof form.error === 'string' ? form.error : JSON.stringify(form.error)}
			</div>
		{/if}
		<div>
			<label for="name"> Display Name </label>
			<input name="name" type="text" />
		</div>
		<div>
			<label for="email"> Email </label>
			<input name="email" type="email" />
		</div>
		<div>
			<label for="password"> Password </label>
			<input name="password" type="password" />
		</div>
		<button>Register</button>
	</form>
</div>
