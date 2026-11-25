<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import type { RichTextAction, RichTextContext } from './actions.js';

	const {
		context,
		actions,
		menu,
	}: {
		context: RichTextContext | undefined;
		actions: RichTextAction[];
		menu: { linking: boolean };
	} = $props();

	let href = $state('');

	$effect(() => {
		if (menu.linking && context) href = context.editor.getAttributes('link').href ?? '';
	});

	function applyLink(event: SubmitEvent) {
		event.preventDefault();
		if (!context) return;
		const chain = context.editor.chain().focus().extendMarkRange('link');
		if (href.trim()) chain.setLink({ href: href.trim() }).run();
		else chain.unsetLink().run();
		menu.linking = false;
	}

	function removeLink() {
		context?.editor.chain().focus().extendMarkRange('link').unsetLink().run();
		menu.linking = false;
	}
</script>

{#if context && menu.linking}
	<form class="link" onsubmit={applyLink}>
		<input
			type="url"
			bind:value={href}
			placeholder={text('RichText.link_placeholder')}
			autofocus
			onkeydown={event => {
				if (event.key != 'Escape') return;
				event.preventDefault();
				menu.linking = false;
				context.editor.commands.focus();
			}}
		/>
		<button class="icon" type="submit" title={text('RichText.link_apply')}><Icon i="check" /></button>
		{#if context.editor.isActive('link')}
			<button class="icon" type="button" title={text('RichText.unlink')} onclick={removeLink}>
				<Icon i="link-slash" />
			</button>
		{/if}
	</form>
{:else if context}
	<div class="actions" role="toolbar">
		{#each actions as action}
			<button
				type="button"
				class={['icon', action.danger && 'danger']}
				title={action.text}
				aria-label={action.text}
				aria-pressed={action.active?.(context)}
				onmousedown={event => event.preventDefault()}
				onclick={() => action.run(context)}
			>
				<Icon i={action.i} />
			</button>
		{/each}
	</div>
{/if}

<style>
	.actions,
	.link {
		display: flex;
		align-items: center;
		gap: 0.25em;
	}

	.link input {
		min-width: 16em;
	}

	button.icon {
		border: none;
		background: none;
		padding: 0.5em;
		display: inline-flex;

		&:hover,
		&[aria-pressed='true'] {
			background-color: var(--bg-accent);
		}
	}
</style>
