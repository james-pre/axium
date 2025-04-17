<script lang="ts">
	import { enhance } from '$app/forms';
	import Dialog from './Dialog.svelte';
	import './styles.css';

	let { children, active = $bindable(null), form, submitText = 'Submit', oncancel = () => {}, action = '', pageMode = false, ...rest } = $props();

	$effect(() => {
		if (form?.success) active = null;
	});

	const show = $derived(!!active || pageMode);

	function onclick(e: MouseEvent) {
		e.preventDefault();
		active = null;
		oncancel(e);
	}
</script>

<Dialog {show} onclose={() => (active = null)}>
	<form method="POST" {action} use:enhance class="main" {...rest}>
		{#if form?.error}
			<div class="error">{form.error}</div>
		{/if}
		{@render children()}
		{#if pageMode}
			<button type="submit" class="submit">{submitText}</button>
		{:else}
			<div class="actions">
				<button type="button" {onclick}>Cancel</button>
				<button type="submit" class="submit">{submitText}</button>
			</div>
		{/if}
	</form>
</Dialog>

<style>
	.actions {
		display: flex;
		gap: 1em;
		flex-direction: row;
		justify-content: space-between;
	}
</style>
