<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as ai from '@axium/ai/common';
	import { Composer, Conversation } from '@axium/ai/components';
	import { withUpdates } from '@axium/ai/live';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';

	const { data } = $props();

	const usable = withUpdates(data.models.models).filter(ai.isUsable);
	const preferred = usable.find(model => model.id == data.preferences.model);

	let model = $state(preferred?.id ?? data.models.default ?? usable[0]?.id ?? '');
	let reasoning = $state(
		ai.preferredReasoning(
			data.preferences.reasoning,
			usable.find(option => option.id == model)
		)
	);

	const temporary = $derived(page.url.searchParams.has('temporary'));

	async function start(content: string) {
		try {
			const conversation = await fetchAPI(
				'PUT',
				'users/:id/ai/conversations',
				{ model: model || undefined, reasoning },
				data.session.userId
			);
			await fetchAPI('PUT', 'ai/conversations/:id', { content }, conversation.id);
			await invalidate('ai:conversations');
			await goto('/ai/' + conversation.id);
		} catch (error) {
			toast('error', error);
			throw error;
		}
	}
</script>

<svelte:head>
	<title>{temporary ? text('ai.temporary.title') : text('app_name.ai')}</title>
</svelte:head>

{#snippet toggle()}
	<a
		href={temporary ? '/ai' : '/ai?temporary'}
		class={['toggle', 'icon-text', temporary && 'active']}
		title={text('ai.temporary.description')}
	>
		<Icon i="ghost" />
		<span>{text('ai.temporary.toggle')}</span>
	</a>
{/snippet}

{#if temporary}
	{const id = crypto.randomUUID()}
	<Conversation
		temporary
		conversation={{ id, model: model || null, reasoning, messages: [] }}
		models={data.models}
		title=""
		ctrlEnter={data.preferences.ctrl_enter}
		actions={toggle}
	/>
{:else}
	<div class="start">
		<div class="corner">{@render toggle()}</div>
		<h2>{text('ai.empty')}</h2>
		<Composer models={data.models.models} bind:model bind:reasoning onsend={start} ctrlEnter={data.preferences.ctrl_enter} />
	</div>
{/if}

<style>
	.start {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1em;
		height: 100%;
		padding: 1em;
	}

	.corner {
		position: absolute;
		top: 0.75em;
		right: 1em;
	}

	.toggle {
		padding: 0.4em 0.9em;
		border-radius: 1.5em;
		border: var(--border-accent);
		background-color: var(--bg-normal);

		&:hover,
		&.active {
			background-color: var(--bg-accent);
		}
	}
</style>
