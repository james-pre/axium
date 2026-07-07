<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import type { Email } from '@axium/email/common';
	import { MessageRow } from '@axium/email/components';
	import { getContext } from 'svelte';
	import { emailApp, type EmailApp } from '../context.js';

	const { data } = $props();

	let emails = $state(data.emails);
	$effect(() => {
		emails = data.emails;
	});

	const app = getContext<EmailApp>(emailApp);
	const { user } = data.session;

	function open(email: Email) {
		if (email.folder == 'drafts') app.composer()?.editDraft(email);
		else void goto(`/email/${data.folder}/${email.id}`);
	}
</script>

<svelte:head>
	<title>{text(`email.${data.folder}`)} — {text('app_name.email')}</title>
</svelte:head>

<div id="email-main">
	{#if !user.username}
		<div class="warning">
			{text('email.no_username')}
			<a href="/account"><u>{text('email.no_username_link')}</u></a>
		</div>
	{/if}
	<div class="bar">
		<button class="reset mobile-only" onclick={() => app.toggleSidebar()}>
			<Icon i="bars" />
		</button>
		<span class="label">{text(`email.${data.folder}`)}</span>
		<button class="reset" onclick={() => invalidateAll()} title={text('email.refresh')}>
			<Icon i="rotate-right" --size="16px" />
		</button>
	</div>
	<div class="email-list">
		{#each emails as email, i (email.id)}
			<MessageRow bind:email={emails[i]} onopen={open} />
		{:else}
			<p class="subtle empty">{text('email.empty_folder')}</p>
		{/each}
	</div>
</div>
