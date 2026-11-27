<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as ai from '@axium/ai/common';
	import { Composer, Conversation } from '@axium/ai/components';
	import { withUpdates } from '@axium/ai/live';
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import * as voice from '@axium/ai/voice';
	import { attach } from '@axium/ai/sandbox';

	const { data } = $props();

	const usable = withUpdates(data.models.models).filter(ai.isUsable);
	const preferred = usable.find(model => model.id == data.preferences.model);

	let model = $state(preferred?.id ?? ai.resolveRole(usable, data.models.roles, 'chat')?.id ?? '');
	let reasoning = $state(
		ai.preferredReasoning(
			data.preferences.reasoning,
			usable.find(option => option.id == model)
		)
	);

	const temporary = $derived(page.url.searchParams.has('temporary'));

	/** Created by the first attachment or message */
	let created: Promise<ai.Conversation> | undefined;

	function conversation(): Promise<ai.Conversation> {
		created ??= fetchAPI('PUT', 'users/:id/ai/conversations', { model: model || undefined, reasoning }, data.session.userId).catch(
			error => {
				created = undefined;
				throw error;
			}
		);
		return created;
	}

	async function start(content: string, options: Partial<Omit<ai.MessageInit, 'content'>> = {}) {
		try {
			const { id } = await conversation();
			const sent = await fetchAPI('PUT', 'ai/conversations/:id', { content, ...options }, id);
			const message = sent.find(message => message.role == 'user');
			if (options.voice && message) voice.addTurn(message.id);
			await invalidate('ai:conversations');
			await goto('/ai/' + id);
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
		sandbox={data.sandbox}
		admin={!!data.session.user.isAdmin}
		actions={toggle}
	/>
{:else}
	<div class="start">
		<div class="corner">{@render toggle()}</div>
		<h2>{text('ai.empty')}</h2>
		<Composer
			models={data.models.models}
			bind:model
			bind:reasoning
			onsend={start}
			onattach={data.sandbox
				? async (file, path, onProgress, signal) => attach((await conversation()).id, file, path, onProgress, signal)
				: undefined}
			ctrlEnter={data.preferences.ctrl_enter}
			admin={!!data.session.user.isAdmin}
		/>
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

	@media (width < 700px) {
		.start {
			height: auto;
			padding: 0.5em 1em 1em;

			h2,
			.corner {
				display: none;
			}
		}
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
