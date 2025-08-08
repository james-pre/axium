<script lang="ts">
	import Dialog from './Dialog.svelte';

	function resolveRedirectAfter() {
		const url = new URL(location.href);
		const maybe = url.searchParams.get('after');
		if (!maybe || maybe == url.pathname) return '/';
		for (const prefix of ['/api/']) if (maybe.startsWith(prefix)) return '/';
		return maybe || '/';
	}

	let {
		children,
		dialog = $bindable(),
		submitText = 'Submit',
		cancel = () => {},
		submit = (data: object): Promise<any> => Promise.resolve(),
		pageMode = false,
		submitDanger = false,
		header,
		footer,
		...rest
	}: {
		children(): any;
		dialog?: HTMLDialogElement;
		/** Change the text displayed for the submit button */
		submitText?: string;
		/** Basically a callback for when the dialog is canceled */
		cancel?(): unknown;
		/** Called on submission, this should do the actual submission */
		submit?(data: Record<string, FormDataEntryValue>): Promise<any>;
		/** Whether to display the dialog as a full-page form */
		pageMode?: boolean;
		submitDanger?: boolean;
		header?(): any;
		footer?(): any;
	} = $props();

	let error = $state<string>();

	$effect(() => {
		if (pageMode) dialog!.showModal();
	});

	function onclose(e: MouseEvent) {
		e.preventDefault();
		cancel();
	}

	function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();
		const data = Object.fromEntries(new FormData(e.currentTarget));
		submit(data)
			.then(result => {
				if (pageMode) window.location.href = resolveRedirectAfter();
				else dialog!.close();
			})
			.catch((e: any) => {
				if (!e) error = 'An unknown error occurred';
				else if (typeof e == 'object' && 'message' in e) error = e.message;
				else error = e;
			});
	}
</script>

{#snippet submitButton()}
	<button type="submit" class={['submit', submitDanger && 'danger']}>{submitText}</button>
{/snippet}

<Dialog bind:dialog {onclose} {...rest}>
	{@render header?.()}
	<form {onsubmit} class="main" method="dialog">
		{#if error}
			<div class="error">{error}</div>
		{/if}
		{@render children()}
		{#if pageMode}
			{@render submitButton()}
		{:else}
			<div class="actions">
				<button type="button" onclick={() => dialog!.close()}>Cancel</button>
				{@render submitButton()}
			</div>
		{/if}
	</form>
	{@render footer?.()}
</Dialog>

<style>
	.actions {
		display: flex;
		gap: 1em;
		flex-direction: row;
		justify-content: space-between;
	}
</style>
