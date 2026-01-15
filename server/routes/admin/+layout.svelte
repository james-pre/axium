<script lang="ts">
	import { Icon } from '@axium/client/components';
	import { capitalize } from 'utilium';

	let { children, data } = $props();
</script>

<div id="admin-container">
	<div id="admin-sidebar">
		{#each data.tabs as { href, name, icon: i, active }}
			<a {href} class={['item', 'icon-text', active && 'active']}><Icon {i} /> <span class="sidebar-text">{capitalize(name)}</span></a
			>
		{/each}
	</div>

	<div id="admin-content">
		{@render children()}
	</div>
</div>

<style>
	#admin-container {
		display: grid;
		grid-template-columns: 15em 1fr;
		height: 100%;
	}

	#admin-sidebar {
		grid-column: 1;
		width: 100%;
		display: inline-flex;
		flex-direction: column;
		gap: 0.5em;
		background-color: var(--bg-alt);
		padding: 1em;
		padding-left: 0;
		border-radius: 0 1em 1em 0;
	}

	.item {
		padding: 0.3em 0.5em;
		border-radius: 0.25em 1em 1em 0.25em;
	}

	.item:hover {
		background-color: var(--bg-strong);
		cursor: pointer;
	}

	.item.active {
		background-color: var(--bg-strong);
	}

	#admin-content {
		grid-column: 2;
		padding: 1em;
		overflow-x: hidden;
		overflow-y: scroll;
	}

	@media (width < 700px) {
		#admin-container {
			grid-template-columns: 1fr;
		}

		#admin-content {
			padding-bottom: 4em;
		}

		#admin-sidebar {
			position: fixed;
			grid-column: unset;
			inset: auto 0 0;
			border-radius: 1em;
			display: flex;
			flex-direction: row;
			justify-content: space-around;
			gap: 1em;
			padding: 0.5em;
		}

		.sidebar-text {
			display: none;
		}

		.item {
			flex: 1 1 0;
			border-radius: 1em;
			padding: 1em;
			justify-content: center;
		}
	}
</style>
