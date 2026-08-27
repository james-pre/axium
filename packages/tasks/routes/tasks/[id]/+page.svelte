<script lang="ts">
	import { goto } from '$app/navigation';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { syncObject } from '@axium/client/reactive';
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();

	let list = $state(data.list);

	syncObject(list, () => goto('/tasks'), 'task_lists');

	let opener = $state.raw<Window | null>(window.opener);

	opener?.addEventListener('beforeunload', () => (opener = null));
	opener?.addEventListener('load', () => (opener = null));
	opener?.addEventListener('popstate', () => {
		opener = opener?.location.pathname == '/tasks' ? window.opener : null;
	});
</script>

<svelte:head>
	<title>{text('tasks.list_page_title', list)}</title>
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

	<TaskList bind:list />
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
