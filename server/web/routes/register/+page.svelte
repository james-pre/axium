<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<div id="main">
	<form method="POST">
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

<style>
	#main {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: sans-serif;
		font-size: 16px;
		color: #bbb;
	}

	#error {
		padding: 1em;
		border-radius: 0.5em;
		background-color: #733;
		color: #ccc;
	}

	form {
		padding: 2em;
		width: max-content;
		height: max-content;
		border-radius: 1em;
		background-color: #111;
		display: flex;
		flex-direction: column;
		gap: 1em;

		div {
			display: flex;
			flex-direction: column;
			gap: 0;
		}
	}

	input,
	button {
		border-radius: 0.5em;
		border: 1px solid #aaa;
		background-color: #222;
	}

	input {
		padding: 0.5em 1em;
		outline: none;
	}

	button {
		padding: 0.5em 1em;
		cursor: pointer;
	}

	button:hover {
		background-color: #334;
	}
</style>
