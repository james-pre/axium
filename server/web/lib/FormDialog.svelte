<script lang="ts">
	import Dialog from './Dialog.svelte';
	import './styles.css';

	let {
		children,
		dialog = $bindable(),
		submitText = 'Submit',
		cancel = () => {},
		submit = (data: object): Promise<any> => Promise.resolve(),
		pageMode = false,
		...rest
	} = $props();

	let success = $state(false);
	let error = $state(null);

	$effect(() => {
		if (success) dialog.close();
	});

	function onclose(e?: MouseEvent) {
		e.preventDefault();
		cancel();
	}

	function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		const data = Object.fromEntries(new FormData(e.currentTarget));
		submit(data)
			.then(result => {
				success = true;
				dialog.close();
			})
			.catch(e => {
				error = e;
			});
	}
</script>

<Dialog bind:dialog show={pageMode} {onclose} {...rest}>
	<form {onsubmit} class="main">
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
