<script lang="ts">
	import { beforeNavigate, goto, invalidate } from '$app/navigation';
	import * as ai from '@axium/ai/common';
	import { watchConversation } from '@axium/ai/live';
	import { fetchAPI, text } from '@axium/client';
	import { Icon, InlineEdit } from '@axium/client/components';
	import { confirm } from '@axium/client/dialogs';
	import { toast } from '@axium/client/toast';
	import { tick, type Snippet } from 'svelte';
	import { renameConversation } from './actions.js';
	import ChatMessage from './ChatMessage.svelte';
	import Composer from './Composer.svelte';
	import ConversationMenu from './ConversationMenu.svelte';
	import { viewTransition } from './transition.js';
	import * as voice from './voice.svelte.js';

	const {
		conversation,
		models,
		title,
		ctrlEnter,
		temporary = false,
		actions,
	}: {
		conversation: Pick<ai.Conversation, 'id' | 'model' | 'reasoning'> & { messages: ai.Message[] };
		models: ai.Models;
		title: string;
		ctrlEnter?: boolean;
		/** Nothing is saved: the messages only exist here, and the server forgets each response once it is sent */
		temporary?: boolean;
		/** Shown in the header of temporary conversations */
		actions?: Snippet;
	} = $props();

	let messages = $state(conversation.messages),
		model = $state(conversation.model ?? ai.resolveRole(models.models, models.roles, 'chat')?.id ?? ''),
		reasoning = $state(conversation.reasoning),
		renaming = $state(false),
		container = $state<HTMLDivElement>(),
		anonymous = $state(false),
		decisions = $state<ai.Decisions>({}),
		allowedTools = $state<string[]>([]);

	const generating = $derived(messages.some(message => message.status == 'pending'));
	const visible = $derived(messages.filter(message => message.role != 'tool'));
	const results = $derived(new Map(messages.filter(message => message.toolCallId).map(message => [message.toolCallId!, message])));
	const awaiting = $derived(messages.filter(message => message.status == 'awaiting'));

	function isNearBottom(): boolean {
		if (!container) return true;
		return container.scrollHeight - container.scrollTop - container.clientHeight < 100;
	}

	function scrollToBottom(): void {
		container?.scrollTo({ top: container.scrollHeight });
	}

	function update(change: () => void): void {
		const stick = isNearBottom();
		change();
		if (stick) void tick().then(scrollToBottom);
	}

	function upsert(message: ai.Message): void {
		update(() => {
			const index = messages.findIndex(existing => existing.id == message.id);
			if (index == -1) messages.push(message);
			else messages[index] = message;
		});
	}

	/** Adds `message` unless a live update already did, which would carry newer text */
	function add(message: ai.Message): void {
		if (!messages.some(existing => existing.id == message.id)) upsert(message);
	}

	function remove(ids: string[]): void {
		messages = messages.filter(message => !ids.includes(message.id));
	}

	/** Deltas received during a reload, applied once it finishes */
	let buffered: ai.Delta[] | null = null;

	async function reload(): Promise<void> {
		if (buffered || temporary) return;
		buffered = [];
		try {
			const latest = await fetchAPI('GET', 'ai/conversations/:id', {}, conversation.id);
			messages = latest.messages;
		} catch (error) {
			toast('error', error);
		}
		const received = buffered;
		buffered = null;
		for (const delta of received) applyDelta(delta);
	}

	/** Reloads when text is missing, e.g. after opening a conversation mid-response. Temporary conversations wait for the finished message instead. */
	function applyDelta(delta: ai.Delta): void {
		if (buffered) {
			buffered.push(delta);
			return;
		}

		const message = messages.find(message => message.id == delta.messageId);
		const current = message?.[delta.field] ?? '';
		if (!message || delta.position > current.length) return void reload();

		update(() => (message[delta.field] = current.slice(0, delta.position) + delta.text));
	}

	$effect(() => watchConversation(conversation.id, { message: upsert, delta: applyDelta, remove, reconnect: reload }));

	$effect(() => void tick().then(scrollToBottom));

	/** Reads replies aloud in conversation mode */
	$effect(() => {
		const index = messages.findLastIndex(message => message.role == 'user');
		const turn = messages[index];
		if (!turn?.voice || !voice.isTurn(turn.id)) return;

		const after = messages.slice(index + 1);
		const replies = after.filter(message => message.role == 'assistant');
		voice.follow(turn.id, replies.map(message => message.content).join('\n'), voice.isSettled(after));
	});

	/** The history a temporary conversation sends with each request, which the server filters as it would a saved one */
	function temporaryHistory(): ai.TemporaryMessage[] {
		return messages
			.filter(message => message.status != 'pending')
			.map(({ id, role, content, toolCalls, toolCallId, status, voice }) => ({
				id,
				role,
				content,
				toolCalls,
				toolCallId,
				status,
				voice,
			}));
	}

	async function respondTemporary(decided?: ai.Decisions): Promise<void> {
		const pending = await fetchAPI(
			'PUT',
			'ai/temporary/:id',
			{ model: model || null, reasoning, anonymous, messages: temporaryHistory(), decisions: decided, allowedTools },
			conversation.id
		);
		add(pending);
	}

	/** Records a choice for a call awaiting approval, and continues the response once every awaiting call has one */
	async function decide(call: ai.ToolCall, decision: ai.Decision) {
		decisions[call.id] = decision;
		if (decision == 'chat' && temporary && !allowedTools.includes(call.name)) allowedTools.push(call.name);
		if (!awaiting.every(message => message.toolCallId! in decisions)) return;

		const decided = $state.snapshot(decisions);
		try {
			if (temporary) await respondTemporary(decided);
			else {
				const { message } = await fetchAPI(
					'POST',
					'ai/conversations/:id',
					{ action: 'decide', decisions: decided },
					conversation.id
				);
				if (message) add(message);
			}
			decisions = {};
		} catch (error) {
			toast('error', error);
		}
	}

	async function sendTemporary(content: string, spoken: boolean): Promise<void> {
		const message: ai.Message = {
			id: crypto.randomUUID(),
			conversationId: conversation.id,
			created: new Date(),
			role: 'user',
			content: content.trim(),
			reasoning: null,
			toolCalls: null,
			toolCallId: null,
			status: 'done',
			error: null,
			usage: null,
			voice: spoken,
		};
		if (spoken) voice.addTurn(message.id);
		if (messages.length) upsert(message);
		else await viewTransition(() => upsert(message));

		try {
			await respondTemporary();
		} catch (error) {
			messages = messages.filter(existing => existing.id != message.id);
			throw error;
		}
	}

	async function send(content: string, spoken = false) {
		try {
			if (temporary) return await sendTemporary(content, spoken);
			const sent = await fetchAPI('PUT', 'ai/conversations/:id', { content, voice: spoken }, conversation.id);
			for (const message of sent) {
				if (message.role == 'user' && spoken) voice.addTurn(message.id);
				upsert(message);
			}
			await invalidate('ai:conversations');
		} catch (error) {
			toast('error', error);
			throw error;
		}
	}

	async function retry() {
		try {
			if (temporary) {
				const previous = messages;
				const lastUser = messages.findLastIndex(message => message.role == 'user');
				messages = messages.slice(0, lastUser + 1);
				try {
					await respondTemporary();
				} catch (error) {
					messages = previous;
					throw error;
				}
				return;
			}
			const { message } = await fetchAPI('POST', 'ai/conversations/:id', { action: 'retry' }, conversation.id);
			if (message) upsert(message);
		} catch (error) {
			toast('error', error);
		}
	}

	/** Replaces the content of one of the user's messages and responds again, dropping the messages after it */
	async function edit(id: string, content: string) {
		const index = messages.findIndex(message => message.id == id);
		const later = messages.slice(index + 1).map(message => message.id);

		try {
			if (temporary) {
				const previous = messages;
				messages = [...messages.slice(0, index), { ...messages[index], content: content.trim() }];
				try {
					await respondTemporary();
				} catch (error) {
					messages = previous;
					throw error;
				}
				return;
			}

			const { message } = await fetchAPI('POST', 'ai/conversations/:id', { action: 'edit', message: id, content }, conversation.id);
			const edited = messages.find(message => message.id == id);
			if (edited) edited.content = content.trim();
			remove(later);
			if (message) add(message);
		} catch (error) {
			toast('error', error);
			throw error;
		}
	}

	function stop() {
		const request = temporary
			? fetchAPI('POST', 'ai/temporary/:id', { action: 'cancel' }, conversation.id)
			: fetchAPI('POST', 'ai/conversations/:id', { action: 'cancel' }, conversation.id);
		request.catch(error => toast('error', error));
	}

	/** Set once the user agreed to discard a temporary conversation */
	let discarding = false;

	beforeNavigate(navigation => {
		if (!temporary || !messages.length || discarding) return;
		navigation.cancel();
		const destination = navigation.to?.url;
		if (navigation.type == 'leave' || !destination) return;

		void confirm(text('ai.temporary.discard_confirm'), { confirmText: text('ai.temporary.discard'), danger: true }).then(confirmed => {
			if (!confirmed) return;
			discarding = true;
			void goto(destination);
		});
	});
</script>

<div class={['conversation', temporary && !messages.length && 'empty']}>
	<div class="header">
		{#if temporary}
			<div class="title icon-text">
				{#if messages.length}
					<Icon i="ghost" />
					<span>{text('ai.temporary.title')}</span>
				{/if}
			</div>
			{@render actions?.()}
		{:else}
			<div class="title">
				{#if renaming}
					<InlineEdit
						value={title}
						schema={ai.ConversationInit.shape.title}
						commit={value => renameConversation(conversation.id, value)}
						close={() => (renaming = false)}
					/>
				{:else}
					<span>{title || text('ai.untitled')}</span>
				{/if}
			</div>
			<ConversationMenu id={conversation.id} onrename={() => (renaming = true)} showToggle="always" />
		{/if}
	</div>

	<div class="messages" bind:this={container}>
		<div class="column">
			{#if temporary && !messages.length}
				<div class="empty">
					<h2>{text('ai.temporary.title')}</h2>
					<p class="subtle">{text('ai.temporary.description')}</p>
					<div class="anonymous">
						<input type="checkbox" id="ai-temporary-anonymous" bind:checked={anonymous} />
						<label for="ai-temporary-anonymous" class="checkbox">
							{#if anonymous}<Icon i="check" --size="1.3em" />{/if}
						</label>
						<label for="ai-temporary-anonymous">{text('ai.temporary.anonymous')}</label>
					</div>
				</div>
			{/if}
			{#each visible as message, index (message.id)}
				<ChatMessage
					{message}
					{ctrlEnter}
					{results}
					{decisions}
					onretry={index == visible.length - 1 && !generating ? retry : undefined}
					onedit={message.role == 'user' && !generating ? content => edit(message.id, content) : undefined}
					ondecide={generating ? undefined : decide}
				/>
			{/each}
		</div>
	</div>

	<div class="footer">
		<Composer
			{generating}
			models={models.models}
			{ctrlEnter}
			bind:model
			bind:reasoning
			onsend={send}
			onstop={stop}
			onoptions={temporary
				? undefined
				: () =>
						fetchAPI('PATCH', 'ai/conversations/:id', { model, reasoning }, conversation.id).catch(error =>
							toast('error', error)
						)}
		/>
	</div>
</div>

<style>
	.conversation {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1em;
		padding: 0.75em 1em;

		.title {
			flex: 1;
			min-width: 10em;
			font-weight: bold;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.messages {
		flex: 1;
		padding: 1em;
		overflow-y: auto;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 1.5em;
		max-width: 50em;
		margin: 0 auto;
	}

	.empty {
		text-align: center;
	}

	.anonymous {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
	}

	.footer {
		display: flex;
		justify-content: center;
		padding: 1em;
	}

	.conversation.empty {
		.messages {
			flex: 0 0 auto;
			margin-top: auto;
		}

		.footer {
			margin-bottom: auto;
		}
	}
</style>
