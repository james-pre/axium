<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { fetchAPI, text } from '@axium/client';
	import { contextMenu } from '@axium/client/attachments';
	import { Icon } from '@axium/client/components';
	import { toast, toastStatus } from '@axium/client/toast';
	import type { Email, EmailChangeable } from '@axium/email/common';

	let { email = $bindable(), onopen }: { email: Email; onopen(email: Email): unknown } = $props();

	function shortDate(date: Date): string {
		const now = new Date();
		if (date.toDateString() == now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
		if (date.getFullYear() == now.getFullYear()) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
		return date.toLocaleDateString();
	}

	async function patch(changes: EmailChangeable) {
		try {
			const result = await fetchAPI('PATCH', 'email/:id', changes, email.id);
			Object.assign(email, result, { attachments: email.attachments });
			if ('folder' in changes) await invalidateAll();
		} catch (e) {
			toast('error', e);
		}
	}

	const correspondents = $derived(
		email.folder == 'sent' || email.folder == 'drafts'
			? email.to.map(m => m.name || m.address).join(', ')
			: email.from.name || email.from.address
	);
</script>

<div
	class={['MessageRow', !email.read && 'unread']}
	onclick={() => onopen(email)}
	role="row"
	tabindex="0"
	{@attach contextMenu(() => [
		{
			i: email.read ? 'envelope' : 'envelope-open',
			text: email.read ? text('email.mark_unread') : text('email.mark_read'),
			action: () => patch({ read: !email.read }),
		},
		{
			i: email.starred ? 'star' : 'regular/star',
			text: email.starred ? text('email.unstar') : text('email.star'),
			action: () => patch({ starred: !email.starred }),
		},
		email.folder != 'archive' &&
			email.folder != 'sent' &&
			email.folder != 'drafts' && { i: 'box-archive', text: text('email.archive'), action: () => patch({ folder: 'archive' }) },
		email.folder == 'inbox' && { i: 'triangle-exclamation', text: text('email.mark_spam'), action: () => patch({ folder: 'spam' }) },
		email.folder == 'spam' && { i: 'inbox', text: text('email.not_spam'), action: () => patch({ folder: 'inbox' }) },
		(email.folder == 'trash' || email.folder == 'archive') && {
			i: 'inbox',
			text: text('email.move_to_inbox'),
			action: () => patch({ folder: 'inbox' }),
		},
		{
			i: 'trash',
			danger: true,
			text: email.folder == 'trash' || email.folder == 'drafts' ? text('email.delete_forever') : text('generic.delete'),
			action: () => toastStatus(fetchAPI('DELETE', 'email/:id', {}, email.id).then(invalidateAll), text('email.toast_deleted')),
		},
	])}
>
	<button
		class="reset star"
		onclick={e => {
			e.stopPropagation();
			void patch({ starred: !email.starred });
		}}
		title={email.starred ? text('email.unstar') : text('email.star')}
	>
		<Icon i={email.starred ? 'star' : 'regular/star'} --size="16px" --fill={email.starred ? 'var(--fg-warning)' : undefined} />
	</button>
	<span class="correspondents">{correspondents}</span>
	<span class="MessageRow-content">
		<span class="subject">{email.subject || text('email.no_subject')}</span>
		{#if email.snippet}
			<span class="snippet subtle mobile-hide">&nbsp;&mdash;&nbsp;{email.snippet}</span>
		{/if}
	</span>
	{#if email.attachments.length}
		<Icon i="paperclip" --size="14px" />
	{/if}
	<span class="date">{shortDate(email.date)}</span>
</div>

<style>
	.MessageRow {
		display: flex;
		align-items: center;
		gap: 0.75em;
		padding: 0.6em 1em;
		border-bottom: var(--border-alt);
		cursor: pointer;
		min-width: 0;

		&:hover {
			background-color: var(--bg-alt);
		}

		&.unread {
			font-weight: bold;
			background-color: var(--bg-menu);

			&:hover {
				background-color: var(--bg-alt);
			}
		}
	}

	.star {
		flex-shrink: 0;
		display: inline-flex;
	}

	.correspondents {
		flex: 0 0 12em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.MessageRow-content {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

		.snippet {
			font-weight: normal;
		}
	}

	.date {
		flex-shrink: 0;
		font-size: 0.85em;
	}

	@media (width < 700px) {
		.MessageRow {
			flex-wrap: wrap;
			row-gap: 0.1em;
		}

		.correspondents {
			flex: 1;
		}

		.MessageRow-content {
			flex-basis: 100%;
			order: 1;
		}
	}
</style>
