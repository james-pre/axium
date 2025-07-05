<script>
	let { children, dialog = $bindable(), ...rest } = $props();
</script>

<dialog bind:this={dialog} {...rest}>
	{@render children()}
</dialog>

<!-- svelte-ignore css_unused_selector -->
<style>
	dialog {
		border-radius: 1em;
		background: #111;
		border: 1px solid #8888;
		padding: 1em;

		form {
			display: contents;
		}
	}

	dialog::backdrop {
		background: #0003;
	}

	dialog[open] {
		animation: zoom 0.25s cubic-bezier(0.35, 1.55, 0.65, 1);
	}

	@keyframes zoom {
		from {
			transform: scale(0.95);
		}
		to {
			transform: scale(1);
		}
	}

	dialog[open]::backdrop {
		animation: fade 0.25s ease-out;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
