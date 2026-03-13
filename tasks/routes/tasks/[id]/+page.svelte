<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();

	let opener = $state.raw<Window | null>(window.opener);

	opener?.addEventListener('beforeunload', () => (opener = null));
	opener?.addEventListener('load', () => (opener = null));
	opener?.addEventListener('popstate', () => {
		opener = opener?.location.pathname == '/tasks' ? window.opener : null;
	});
</script>

<svelte:head>
	<title>{text('tasks.list_page_title', { name: data.list.name })}</title>
</svelte:head>

<div class="list-container">
	{#if opener}
		<div>
			<button
				class="icon-text"
				onclick={() => {
					opener?.focus();
					close();
				}}
			>
				<Icon i="arrow-left-from-bracket" />
				<span>{text('tasks.back_to_main')}</span>
			</button>
		</div>
	{/if}

	<TaskList list={data.list} user={data.session?.user} />
</div>

<style>
	.list-container {
		display: flex;
		flex-direction: column;
		gap: 1em;
		padding: 1em;
		inset: 1em;
	}

	:global(.task-list-header [popover]) {
		right: 1em;
	}
</style>
