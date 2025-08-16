<script lang="ts">
	import { Icon } from '@axium/server/components';
	import { TaskList } from '@axium/tasks/components';

	const { data } = $props();

	let opener = $state<Window | null>(window.opener);

	opener?.addEventListener('beforeunload', () => {
		opener = null;
	});
</script>

<svelte:head>
	<title>Tasks — {data.list.name}</title>
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
				<Icon i="arrow-left-from-bracket" /> Back to Tasks
			</button>
		</div>
	{/if}

	<TaskList list={data.list} />
</div>

<style>
	.list-container {
		display: flex;
		flex-direction: column;
		gap: 1em;
		padding: 1em;
		inset: 1em;
	}
</style>
