<script lang="ts">
	import Icon from './Icon.svelte';

	interface Tab {
		href: string;
		name: string;
		icon: string;
		active: boolean;
		mobile?: false;
	}

	interface MobileTab {
		href: string;
		icon: string;
		active: boolean;
		mobile: true;
	}

	let { children, tabs, bottom }: { children(): any; tabs: (Tab | MobileTab)[]; bottom?(): any } = $props();
</script>

<div class="sidebar-container">
	<div class="sidebar">
		{#each tabs as tab}
			<a href={tab.href} class={['item', 'icon-text', tab.active && 'active', tab.mobile && 'mobile-only']}>
				<Icon i={tab.icon} />
				{#if !tab.mobile}<span class="sidebar-text">{tab.name}</span>{/if}
			</a>
		{/each}

		{#if bottom}
			<div class="sidebar-bottom">
				{@render bottom()}
			</div>
		{/if}
	</div>

	<div class="sidebar-content">
		{@render children()}
	</div>
</div>

<style>
	.sidebar-container {
		display: grid;
		grid-template-columns: 15em 1fr;
		height: 100%;

		@media (width < 700px) {
			grid-template-columns: 1fr;
		}
	}

	.sidebar {
		grid-column: 1;
		width: 100%;
		display: inline-flex;
		flex-direction: column;
		gap: 0.5em;
		background-color: var(--bg-alt);
		padding: 1em;
		padding-left: 0;
		border-radius: 0 1em 1em 0;

		@media (width < 700px) {
			position: fixed;
			grid-column: unset;
			inset: auto 0 0;
			border-radius: 1em;
			display: flex;
			flex-direction: row;
			justify-content: space-around;
			gap: 1em;
			padding: 0.5em;
			z-index: 6;

			.sidebar-text {
				display: none;
			}
		}

		.item {
			padding: 0.3em 0.5em;
			border-radius: 0.25em 1em 1em 0.25em;

			@media (width < 700px) {
				flex: 1 1 0;
				border-radius: 1em;
				padding: 1em;
				justify-content: center;
			}
		}

		.item:hover {
			background-color: var(--bg-strong);
			cursor: pointer;
		}

		.item.active {
			background-color: var(--bg-strong);
		}
	}

	.sidebar-content {
		grid-column: 2;
		padding: 1em;
		overflow-x: hidden;
		overflow-y: scroll;

		@media (width < 700px) {
			padding-bottom: 5em;
			grid-column: 1;
		}
	}

	.sidebar-bottom {
		margin-top: auto;
		margin-left: 1em;

		@media (width < 700px) {
			display: none;
		}
	}
</style>
