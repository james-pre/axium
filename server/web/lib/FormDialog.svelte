<script lang="ts">
	import Dialog from './Dialog.svelte';
	import './styles.css';

	let { children, active = $bindable(null), submitText = 'Submit', cancel = () => {}, submit = (data: object) => {}, pageMode = false, ...rest } = $props();

	let dialog;
	let success = $state(false);
	let error = $state(null);

	$effect(() => {
		if (success) active = null;
	});

	const show = $derived(!!active || pageMode);

	function onclose(e?: MouseEvent) {
		e.preventDefault();
		active = null;
		cancel();
	}

	function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		const data = Object.fromEntries(new FormData(e.currentTarget));
		Promise.resolve(submit(data))
			.then(result => {
				success = true;
			})
			.catch(e => {
				error = e;
			});
	}
</script>

<Dialog bind:this={dialog} {show} {onclose}>
	<form {onsubmit} class="main" {...rest}>
		{#if error}
			<div class="error">{error}</div>
		{/if}
		{@render children()}
		{#if pageMode}
			<button type="submit" class="submit">{submitText}</button>
		{:else}
			<div class="actions">
				<button type="button" onclick={() => dialog.close()}>Cancel</button>
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
