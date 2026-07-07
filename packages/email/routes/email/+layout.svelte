<script lang="ts">
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { Composer } from '@axium/email/components';
	import { setContext } from 'svelte';
	import { emailApp, type EmailApp } from './context.js';
	import './email.css';

	const { data, children } = $props();

	let composer = $state<ReturnType<typeof Composer>>();
	let sidebar = $state<HTMLDivElement>();

	setContext<EmailApp>(emailApp, {
		composer: () => composer,
		toggleSidebar: () => sidebar?.classList.toggle('active'),
	});

	afterNavigate(() => sidebar?.classList.remove('active'));

	const folders = [
		['inbox', 'inbox'],
		['starred', 'star'],
		['sent', 'paper-plane'],
		['drafts', 'file-lines'],
		['spam', 'triangle-exclamation'],
		['trash', 'trash'],
		['archive', 'box-archive'],
	] as const;

	const current = $derived(page.params.folder ?? 'inbox');
</script>

<div id="email-app">
	<div id="email-sidebar" bind:this={sidebar}>
		<button class="compose icon-text" onclick={() => composer?.compose()}>
			<Icon i="pen" />
			<span>{text('email.compose')}</span>
		</button>
		{#each folders as [name, icon]}
			<a href="/email/{name}" class={['email-sidebar-item', 'icon-text', current == name && 'active']}>
				<Icon i={icon} --size="16px" />
				<span>{text(`email.${name}`)}</span>
			</a>
		{/each}
	</div>

	{@render children()}

	{#if data.session}
		<button class="mobile-only mobile-float-right mobile-button icon-text" onclick={() => composer?.compose()}>
			<Icon i="pen" />
			<span>{text('email.compose')}</span>
		</button>
		<Composer bind:this={composer} userId={data.session.userId} onSent={() => invalidateAll()} />
	{/if}
</div>
