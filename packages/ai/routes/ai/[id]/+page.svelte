<script lang="ts">
	import { Conversation } from '@axium/ai/components';
	import { text } from '@axium/client';

	const { data } = $props();

	const title = $derived(
		data.conversations.find(conversation => conversation.id == data.conversation.id)?.title ?? data.conversation.title
	);
</script>

<svelte:head>
	<title>{text('ai.conversation_title', { title: title || text('ai.untitled') })}</title>
</svelte:head>

{#key data.conversation.id}
	<Conversation conversation={data.conversation} models={data.models} {title} ctrlEnter={data.preferences.ctrl_enter} />
{/key}
