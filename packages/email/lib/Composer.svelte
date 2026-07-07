<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { closeOnBackGesture } from '@axium/client/attachments';
	import { Icon } from '@axium/client/components';
	import { toast, toastStatus } from '@axium/client/toast';
	import type { Email, Mailbox } from '@axium/email/common';
	import AddressChips from './AddressChips.svelte';

	let {
		dialog = $bindable(),
		userId,
		onSent,
	}: {
		dialog?: HTMLDialogElement;
		userId: string;
		onSent?(email: Email): unknown;
	} = $props();

	let to = $state<Mailbox[]>([]),
		cc = $state<Mailbox[]>([]),
		bcc = $state<Mailbox[]>([]),
		subject = $state(''),
		body = $state(''),
		inReplyTo = $state<string | null>(null),
		draftId = $state<string | null>(null),
		showCc = $state(false),
		showBcc = $state(false),
		sending = $state(false);

	export function compose() {
		reset();
		dialog?.showModal();
	}

	export function editDraft(draft: Email) {
		reset();
		to = [...draft.to];
		cc = [...draft.cc];
		bcc = [...draft.bcc];
		showCc = !!draft.cc.length;
		showBcc = !!draft.bcc.length;
		subject = draft.subject;
		body = draft.text ?? '';
		inReplyTo = draft.inReplyTo ?? null;
		draftId = draft.id;
		dialog?.showModal();
	}

	export function reply(email: Email) {
		reset();
		to = [email.from];
		subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
		inReplyTo = email.messageId;
		const quoted = (email.text ?? '').replaceAll(/^/gm, '> ');
		body = `\n\n${text('Composer.on_wrote', { date: email.date.toLocaleString(), name: email.from.name || email.from.address })}\n${quoted}`;
		dialog?.showModal();
	}

	export function forward(email: Email) {
		reset();
		subject = /^fwd:/i.test(email.subject) ? email.subject : `Fwd: ${email.subject}`;
		body = [
			'',
			'',
			`---------- ${text('Composer.forwarded_message')} ----------`,
			`From: ${email.from.name || ''} <${email.from.address}>`,
			`Date: ${email.date.toLocaleString()}`,
			`Subject: ${email.subject}`,
			`To: ${email.to.map(m => m.address).join(', ')}`,
			'',
			email.text ?? '',
		].join('\n');
		dialog?.showModal();
	}

	function reset() {
		to = [];
		cc = [];
		bcc = [];
		subject = '';
		body = '';
		inReplyTo = null;
		draftId = null;
		showCc = false;
		showBcc = false;
	}

	async function send() {
		if (!to.length && !cc.length && !bcc.length) {
			toast('warning', text('Composer.no_recipients'));
			return;
		}
		sending = true;
		try {
			const email = await fetchAPI('PUT', 'users/:id/email', { to, cc, bcc, subject, text: body, inReplyTo, draftId }, userId);
			toast('success', text('email.toast_sent'));
			dialog?.close();
			reset();
			onSent?.(email);
		} catch (e) {
			toast('error', e);
		} finally {
			sending = false;
		}
	}

	async function saveDraft() {
		const promise = fetchAPI(
			'PUT',
			'users/:id/email',
			{ to, cc, bcc, subject, text: body, inReplyTo, draftId, isDraft: true },
			userId
		).then(draft => {
			draftId = draft.id;
		});
		await toastStatus(promise, text('email.toast_draft_saved'));
	}
</script>

<dialog bind:this={dialog} class="Composer" {@attach closeOnBackGesture}>
	<div class="composer-header">
		<strong>{text('Composer.title')}</strong>
		<button type="button" class="reset" onclick={() => dialog?.close()}>
			<Icon i="xmark" />
		</button>
	</div>
	<div class="field">
		<label for="composer-to">{text('Composer.to')}</label>
		<AddressChips id="composer-to" bind:value={to} />
		<span class="cc-toggles subtle">
			{#if !showCc}<button type="button" class="reset" onclick={() => (showCc = true)}>{text('Composer.cc')}</button>{/if}
			{#if !showBcc}<button type="button" class="reset" onclick={() => (showBcc = true)}>{text('Composer.bcc')}</button>{/if}
		</span>
	</div>
	{#if showCc}
		<div class="field">
			<label for="composer-cc">{text('Composer.cc')}</label>
			<AddressChips id="composer-cc" bind:value={cc} />
		</div>
	{/if}
	{#if showBcc}
		<div class="field">
			<label for="composer-bcc">{text('Composer.bcc')}</label>
			<AddressChips id="composer-bcc" bind:value={bcc} />
		</div>
	{/if}
	<div class="field">
		<label for="composer-subject">{text('Composer.subject')}</label>
		<input id="composer-subject" type="text" bind:value={subject} maxlength="998" />
	</div>
	<textarea bind:value={body} placeholder={text('Composer.body_placeholder')}></textarea>
	<div class="composer-actions">
		<button type="button" class="icon-text send" onclick={send} disabled={sending}>
			<Icon i="paper-plane" />
			<span>{text('Composer.send')}</span>
		</button>
		<button type="button" onclick={saveDraft} disabled={sending}>{text('Composer.save_draft')}</button>
		<button
			type="button"
			class="reset discard"
			onclick={() => {
				dialog?.close();
				reset();
			}}
		>
			<Icon i="trash" />
			<span class="mobile-hide">{text('Composer.discard')}</span>
		</button>
	</div>
</dialog>

<style>
	dialog.Composer {
		display: none;
		flex-direction: column;
		gap: 0.5em;
		width: min(40em, calc(100% - 2em));
		height: min(35em, 90dvh);

		&:modal {
			display: flex;
		}
	}

	.composer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.5em;
		border-bottom: var(--border-alt);
		padding-bottom: 0.25em;

		label {
			color: var(--fg-disabled);
			flex-shrink: 0;
		}

		input {
			border: none;
			border-radius: 0;
			flex: 1;
			padding: 0.25em 0;
		}
	}

	.cc-toggles {
		display: flex;
		gap: 0.75em;
		flex-shrink: 0;

		button:hover {
			text-decoration: underline;
		}
	}

	textarea {
		flex: 1;
		resize: none;
		border: none;
		padding: 0.5em 0;
		font-size: 16px;
	}

	.composer-actions {
		display: flex;
		align-items: center;
		gap: 1em;

		.send {
			font-weight: bold;
		}

		.discard {
			margin-left: auto;
			display: inline-flex;
			align-items: center;
			gap: 0.5em;
		}
	}
</style>
