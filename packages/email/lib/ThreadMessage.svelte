<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { formatBytes } from '@axium/core/format';
	import { splitQuoted, type Email } from '@axium/email/common';

	let {
		email = $bindable(),
		expanded = $bindable(false),
		onreply,
		onforward,
	}: {
		email: Email;
		expanded?: boolean;
		onreply(email: Email): unknown;
		onforward(email: Email): unknown;
	} = $props();

	const body = $derived(splitQuoted(email.text ?? ''));
	let showQuoted = $state(false);

	$effect(() => {
		if (!expanded || email.read) return;
		fetchAPI('PATCH', 'email/:id', { read: true }, email.id).then(
			() => (email.read = true),
			e => toast('error', e)
		);
	});

	async function toggleStar(e: Event) {
		e.stopPropagation();
		try {
			const result = await fetchAPI('PATCH', 'email/:id', { starred: !email.starred }, email.id);
			email.starred = result.starred;
		} catch (e) {
			toast('error', e);
		}
	}

	const toNames = $derived(email.to.map(m => (m.name ? `${m.name} <${m.address}>` : m.address)).join(', '));
</script>

<div class={['ThreadMessage', expanded && 'expanded']}>
	{#if !expanded}
		<div class="tm-collapsed" onclick={() => (expanded = true)} role="button" tabindex="0">
			<strong class="tm-from">{email.from.name || email.from.address}</strong>
			<span class="tm-snippet subtle">{email.snippet ?? ''}</span>
			<span class="tm-date subtle">{email.date.toLocaleDateString()}</span>
		</div>
	{:else}
		<div class="tm-header" onclick={() => (expanded = false)} role="button" tabindex="0">
			<div class="tm-headers">
				<div>
					<strong>{email.from.name || email.from.address}</strong>
					{#if email.from.name}
						<span class="subtle">&lt;{email.from.address}&gt;</span>
					{/if}
				</div>
				<span class="subtle">{text('ThreadMessage.to_line', { names: toNames })}</span>
			</div>
			<span class="tm-date subtle">{email.date.toLocaleString()}</span>
			<button class="reset" onclick={toggleStar} title={email.starred ? text('email.unstar') : text('email.star')}>
				<Icon i={email.starred ? 'star' : 'regular/star'} --size="16px" --fill={email.starred ? 'var(--fg-warning)' : undefined} />
			</button>
		</div>

		<div class="tm-body">
			{#if email.html}
				<iframe sandbox="" srcdoc={email.html} title={email.subject || text('email.no_subject')}></iframe>
			{:else}
				<pre>{body.content}</pre>
				{#if body.quoted}
					<button class="quote-toggle" title={text('ThreadMessage.trimmed')} onclick={() => (showQuoted = !showQuoted)}>
						<Icon i="ellipsis" --size="14px" />
					</button>
					{#if showQuoted}
						<pre class="subtle">{body.quoted}</pre>
					{/if}
				{/if}
			{/if}
		</div>

		{#if email.attachments.length}
			<div class="tm-attachments">
				{#each email.attachments as attachment}
					<a href="/api/email/{email.id}/attachments/{attachment.id}" download={attachment.filename}>
						<span class="tm-attachment icon-text">
							<Icon i="paperclip" --size="14px" />
							<span>{attachment.filename}</span>
							<span class="subtle">{formatBytes(attachment.size)}</span>
						</span>
					</a>
				{/each}
			</div>
		{/if}

		<div class="tm-actions">
			<button class="icon-text" onclick={() => onreply(email)}>
				<Icon i="reply" />
				<span>{text('email.reply')}</span>
			</button>
			<button class="icon-text" onclick={() => onforward(email)}>
				<Icon i="share" />
				<span>{text('email.forward')}</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.ThreadMessage {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
		padding: 0.75em 0;

		&:not(:last-child) {
			border-bottom: var(--border-alt);
		}
	}

	.tm-collapsed {
		display: flex;
		align-items: center;
		gap: 0.75em;
		cursor: pointer;
		min-width: 0;

		.tm-from {
			flex: 0 0 12em;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.tm-snippet {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.tm-header {
		display: flex;
		align-items: flex-start;
		gap: 0.75em;
		cursor: pointer;

		.tm-headers {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			gap: 0.25em;
		}

		button {
			display: inline-flex;
		}
	}

	.tm-date {
		flex-shrink: 0;
		font-size: 0.85em;
	}

	.tm-body {
		pre {
			background: none;
			padding: 0;
			white-space: pre-wrap;
			word-break: break-word;
			font-family: inherit;
			margin: 0;
		}

		iframe {
			width: 100%;
			height: 50vh;
			border: none;
			background-color: white;
			border-radius: 0.5em;
		}
	}

	.quote-toggle {
		display: inline-flex;
		margin: 0.5em 0;
		padding: 0 0.5em;
		border-radius: 1em;
		background-color: var(--bg-accent);
	}

	.tm-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;

		.tm-attachment {
			gap: 0.5em;
			padding: 0.4em 0.8em;
			border: var(--border-accent);
			border-radius: 0.5em;

			&:hover {
				background-color: var(--bg-accent);
			}
		}
	}

	.tm-actions {
		display: flex;
		gap: 1em;
	}
</style>
