<script lang="ts">
	import { page } from '$app/state';
	import { AIConversationInit } from '@axium/ai/common';
	import { renameConversation } from '@axium/ai/actions';
	import { ConversationMenu } from '@axium/ai/components';
	import { text } from '@axium/client';
	import { Icon, InlineEdit, TopBarContent } from '@axium/client/components';

	const { data, children } = $props();

	let renaming = $state<string>();
</script>

<TopBarContent name={text('app_name.ai')} icon="sparkles" href="/ai" />

<div id="ai-app" class={[page.params.id && 'in-conversation']}>
	<nav id="ai-sidebar">
		<a href="/ai" class="new icon-text">
			<Icon i="plus" />
			<span>{text('ai.new')}</span>
		</a>
		{#each data.conversations as conversation (conversation.id)}
			<div class={['item', page.params.id == conversation.id && 'active']}>
				{#if renaming == conversation.id}
					<InlineEdit
						value={conversation.title}
						schema={AIConversationInit.shape.title}
						commit={title => renameConversation(conversation.id, title)}
						close={() => (renaming = undefined)}
					/>
				{:else}
					<a href="/ai/{conversation.id}">{conversation.title || text('ai.untitled')}</a>
					<ConversationMenu id={conversation.id} onrename={() => (renaming = conversation.id)} />
				{/if}
			</div>
		{/each}
	</nav>

	<main id="ai-main">
		{@render children()}
	</main>
</div>

<style>
	#ai-app {
		display: grid;
		grid-template-columns: 15em 1fr;
		position: fixed;
		inset: var(--top-bar-height, 0px) 0 0;
	}

	#ai-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		padding: 1em;
		overflow-y: auto;

		.new {
			justify-content: center;
			padding: 0.5em 1em;
			margin-bottom: 1em;
			border-radius: 1.5em;
			background-color: var(--bg-alt);
		}

		.item {
			display: flex;
			align-items: center;
			gap: 0.5em;
			padding: 0.5em 1em;
			border-radius: 1.5em;

			a {
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			&:hover {
				background-color: var(--bg-alt);
			}

			&.active {
				background-color: var(--bg-accent);
				font-weight: bold;
			}
		}
	}

	#ai-main {
		min-width: 0;
		min-height: 0;
		margin: 0 1em 1em 0;
		border-radius: 1em;
		background-color: var(--bg-menu);
		overflow: hidden;
	}

	@media (width < 700px) {
		#ai-app {
			grid-template-columns: 1fr;
		}

		#ai-main {
			margin: 0;
			border-radius: 0;
		}

		#ai-app.in-conversation #ai-sidebar,
		#ai-app:not(.in-conversation) #ai-main {
			display: none;
		}
	}
</style>
