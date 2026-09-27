<script lang="ts">
	import { instanceMetadata } from '@axium/client';
	import type { UserPublic } from '@axium/core/user';
	import AppMenu from './AppMenu.svelte';
	import Icon from './Icon.svelte';
	import PWAIndicator from './PWAIndicator.svelte';
	import { currentContent } from './TopBarContent.svelte';
	import UserMenu from './UserMenu.svelte';
	import Boundary from './Boundary.svelte';

	const { user }: { user?: UserPublic } = $props();

	const content = $derived(currentContent());
</script>

<header class="TopBar">
	{#if content}
		<a class="title" href={content.href}>
			{#if content.icon}<Icon i={content.icon} --size="1.25em" />{/if}
			<span>{content.name}</span>
		</a>
		{#if content.children}
			<div class="middle">{@render content.children()}</div>
		{/if}
	{:else}
		<a class="title" href="/">
			<img src="/favicon.svg" alt="" />
			<Boundary inline>
				{#await instanceMetadata() then { name }}<span>{name}</span>{/await}
			</Boundary>
		</a>
	{/if}

	<div class="end">
		<PWAIndicator />
		{#if user}<AppMenu />{/if}
		<UserMenu {user} />
	</div>
</header>

<style>
	.TopBar {
		position: sticky;
		top: 0;
		z-index: 20;
		height: var(--top-bar-height);
		display: flex;
		align-items: center;
		gap: 1em;
		padding: 0.5em 1em;
		background-color: var(--bg-normal);
	}

	@supports (animation-timeline: scroll()) {
		.TopBar {
			animation: top-bar-shadow linear both;
			animation-timeline: scroll(root);
			animation-range: 0 2em;
		}
	}

	@keyframes top-bar-shadow {
		to {
			box-shadow: 0 0.25em 0.75em -0.25em #0008;
		}
	}

	.title {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
		font-size: 1.25em;
		white-space: nowrap;

		span {
			overflow: hidden;
			text-overflow: ellipsis;
		}

		img {
			width: 1.25em;
			height: 1.25em;
		}
	}

	.middle {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
	}

	.end {
		margin-left: auto;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 1em;
	}

	@media (width < 700px) {
		.TopBar {
			gap: 0.75em;
			padding: 0.5em 0.75em;
		}

		.TopBar:has(.middle) .title span {
			display: none;
		}

		.end {
			gap: 0.75em;
		}
	}

	@media (width >= 700px) {
		.end :global(:popover-open) {
			left: auto;
			right: anchor(right);
			top: calc(anchor(bottom) + 0.5em);
			position-try-fallbacks: none;
			width: max-content;
			height: fit-content;
		}
	}

	:global {
		html:has(.TopBar) {
			--top-bar-height: 3.5rem;
		}

		body:has(.TopBar) {
			margin: 0;
		}
	}
</style>
