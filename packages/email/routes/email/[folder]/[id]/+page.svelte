<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast, toastStatus } from '@axium/client/toast';
	import type { Email, EmailChangeable } from '@axium/email/common';
	import { ThreadMessage } from '@axium/email/components';
	import { getContext, untrack } from 'svelte';
	import { emailApp, type EmailApp } from '../../context.js';

	const { data } = $props();

	const app = getContext<EmailApp>(emailApp);

	/** Expand the opened and unread messages by default */
	function initExpanded(): Record<string, boolean> {
		const init: Record<string, boolean> = {};
		for (const email of data.thread) init[email.id] = email.id == data.id || !email.read;
		return init;
	}

	let thread = $state(data.thread);
	let expanded = $state(initExpanded());

	$effect(() => {
		thread = data.thread;
		// keep the user's manual expansion when the thread refreshes (e.g. new mail arrives)
		expanded = { ...initExpanded(), ...untrack(() => expanded) };
	});

	const focused = $derived(thread.find(email => email.id == data.id) ?? thread.at(-1)!);
	const back = $derived(`/email/${data.folder}`);

	async function patch(changes: EmailChangeable) {
		try {
			const result = await fetchAPI('PATCH', 'email/:id', changes, focused.id);
			Object.assign(focused, result, { attachments: focused.attachments });
			if ('folder' in changes) await goto(back);
		} catch (e) {
			toast('error', e);
		}
	}

	function remove() {
		toastStatus(
			fetchAPI('DELETE', 'email/:id', {}, focused.id).then(() => goto(back)),
			text('email.toast_deleted')
		);
	}

	function reply(email: Email) {
		app.composer()?.reply(email);
	}

	function forward(email: Email) {
		app.composer()?.forward(email);
	}
</script>

<svelte:head>
	<title>{focused.subject || text('email.no_subject')} — {text('app_name.email')}</title>
</svelte:head>

<div id="email-view-container">
	<div class="view-actions">
		<a href={back} title={text('email.back')}>
			<button class="reset"><Icon i="arrow-left" /></button>
		</a>
		<button
			class="reset"
			onclick={() => patch({ starred: !focused.starred })}
			title={focused.starred ? text('email.unstar') : text('email.star')}
		>
			<Icon i={focused.starred ? 'star' : 'regular/star'} --fill={focused.starred ? 'var(--fg-warning)' : undefined} />
		</button>
		{#if focused.folder != 'archive' && focused.folder != 'sent' && focused.folder != 'drafts'}
			<button class="reset" onclick={() => patch({ folder: 'archive' })} title={text('email.archive')}>
				<Icon i="box-archive" />
			</button>
		{/if}
		{#if focused.folder == 'spam' || focused.folder == 'trash' || focused.folder == 'archive'}
			<button class="reset" onclick={() => patch({ folder: 'inbox' })} title={text('email.move_to_inbox')}>
				<Icon i="inbox" />
			</button>
		{:else if focused.folder == 'inbox'}
			<button class="reset" onclick={() => patch({ folder: 'spam' })} title={text('email.mark_spam')}>
				<Icon i="triangle-exclamation" />
			</button>
		{/if}
		<button class="reset" onclick={() => patch({ read: false }).then(() => goto(back))} title={text('email.mark_unread')}>
			<Icon i="envelope" />
		</button>
		<button
			class="reset danger"
			onclick={remove}
			title={focused.folder == 'trash' || focused.folder == 'drafts' ? text('email.delete_forever') : text('generic.delete')}
		>
			<Icon i="trash" />
		</button>
	</div>

	<h2 class="subject">{focused.subject || text('email.no_subject')}</h2>

	<div class="thread">
		{#each thread as email, i (email.id)}
			<ThreadMessage bind:email={thread[i]} bind:expanded={expanded[email.id]} onreply={reply} onforward={forward} />
		{/each}
	</div>
</div>

<style>
	.view-actions {
		display: flex;
		align-items: center;
		gap: 1.25em;

		button {
			display: inline-flex;
		}
	}

	.subject {
		margin: 0;
	}

	.thread {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
</style>
