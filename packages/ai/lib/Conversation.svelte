<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { AIConversationInit, type AIConversation, type AIDelta, type AIMessage, type AIModels } from '@axium/ai/common';
	import { watchConversation } from '@axium/ai/live';
	import { fetchAPI, text } from '@axium/client';
	import { InlineEdit } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { tick } from 'svelte';
	import { renameConversation } from './actions.js';
	import ChatMessage from './ChatMessage.svelte';
	import Composer from './Composer.svelte';
	import ConversationMenu from './ConversationMenu.svelte';

	const {
		conversation,
		models,
		title,
		ctrlEnter,
	}: { conversation: AIConversation & { messages: AIMessage[] }; models: AIModels; title: string; ctrlEnter?: boolean } = $props();

	let messages = $state(conversation.messages);
	let model = $state(conversation.model ?? models.default ?? '');
	let reasoning = $state(conversation.reasoning);
	let renaming = $state(false);
	let container = $state<HTMLDivElement>();

	const generating = $derived(messages.some(message => message.status == 'pending'));
	const visible = $derived(messages.filter(message => message.role != 'tool'));

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

	function upsert(message: AIMessage): void {
		update(() => {
			const index = messages.findIndex(existing => existing.id == message.id);
			if (index == -1) messages.push(message);
			else messages[index] = message;
		});
	}

	/** Deltas received during a reload, applied once it finishes */
	let buffered: AIDelta[] | null = null;

	async function reload(): Promise<void> {
		if (buffered) return;
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

	/** Reloads when text is missing, e.g. after opening a conversation mid-response */
	function applyDelta(delta: AIDelta): void {
		if (buffered) {
			buffered.push(delta);
			return;
		}

		const message = messages.find(message => message.id == delta.messageId);
		const current = message?.[delta.field] ?? '';
		if (!message || delta.position > current.length) return void reload();

		update(() => (message[delta.field] = current.slice(0, delta.position) + delta.text));
	}

	$effect(() => watchConversation(conversation.id, { message: upsert, delta: applyDelta, reconnect: reload }));

	$effect(() => void tick().then(scrollToBottom));

	async function send(content: string) {
		try {
			for (const message of await fetchAPI('PUT', 'ai/conversations/:id', { content }, conversation.id)) upsert(message);
			await invalidate('ai:conversations');
		} catch (error) {
			toast('error', error);
			throw error;
		}
	}

	async function retry() {
		try {
			const { message } = await fetchAPI('POST', 'ai/conversations/:id', { action: 'retry' }, conversation.id);
			if (message) upsert(message);
		} catch (error) {
			toast('error', error);
		}
	}
</script>

<div class="conversation">
	<div class="header">
		<div class="title">
			{#if renaming}
				<InlineEdit
					value={title}
					schema={AIConversationInit.shape.title}
					commit={value => renameConversation(conversation.id, value)}
					close={() => (renaming = false)}
				/>
			{:else}
				<span>{title || text('ai.untitled')}</span>
			{/if}
		</div>
		<ConversationMenu id={conversation.id} onrename={() => (renaming = true)} showToggle="always" />
	</div>

	<div class="messages" bind:this={container}>
		<div class="column">
			{#each visible as message, index (message.id)}
				<ChatMessage {message} onretry={index == visible.length - 1 && !generating ? retry : undefined} />
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
			onstop={() =>
				fetchAPI('POST', 'ai/conversations/:id', { action: 'cancel' }, conversation.id).catch(error => toast('error', error))}
			onoptions={() =>
				fetchAPI('PATCH', 'ai/conversations/:id', { model, reasoning }, conversation.id).catch(error => toast('error', error))}
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

	.footer {
		display: flex;
		justify-content: center;
		padding: 1em;
	}
</style>
