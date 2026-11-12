<script lang="ts">
	import * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';

	const {
		memory,
		maxLength,
		onsave,
		oncancel,
	}: {
		/** The memory being edited, if any */
		memory?: ai.Memory;
		maxLength: number;
		onsave(values: { id: string; description: string; content: string }): Promise<unknown>;
		oncancel?(): void;
	} = $props();

	let id = $state(memory?.id ?? ''),
		description = $state(memory?.description ?? ''),
		content = $state(memory?.content ?? ''),
		saving = $state(false),
		idEdited = $state(!!memory);

	const idError = $derived(id && !ai.MemoryId.safeParse(id).success ? text('ai.memory.id_invalid') : undefined);
	const valid = $derived(!!id && !idError && !!description.trim());

	function suggestId(from: string): string {
		return from
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.split('-')
			.slice(0, 5)
			.join('-')
			.slice(0, 64);
	}

	async function submit() {
		if (!valid || saving) return;
		saving = true;
		try {
			await onsave({ id, description: description.trim(), content: content.trim() });
			if (memory) return;
			id = description = content = '';
			idEdited = false;
		} finally {
			saving = false;
		}
	}
</script>

<form
	class="MemoryForm"
	onsubmit={e => {
		e.preventDefault();
		void submit();
	}}
>
	<input
		bind:value={description}
		placeholder={text('ai.memory.description_placeholder')}
		maxlength="200"
		oninput={() => {
			if (!idEdited) id = suggestId(description);
		}}
	/>
	<input
		bind:value={id}
		class={['id', idError && 'error']}
		placeholder={text('ai.memory.id_placeholder')}
		maxlength="64"
		title={idError}
		oninput={() => (idEdited = true)}
	/>
	<textarea bind:value={content} placeholder={text('ai.memory.content_placeholder')} maxlength={maxLength} {@attach dynamicRows(12, 2)}
	></textarea>
	<div class="actions">
		{#if oncancel}
			<button type="button" onclick={oncancel}>{text('generic.cancel')}</button>
		{/if}
		<button type="submit" class="primary" disabled={!valid || saving}>{memory ? text('ai.memory.save') : text('ai.memory.add')}</button>
	</div>
</form>

<style>
	.MemoryForm {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.id {
		font-family: monospace;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5em;

		.primary {
			background-color: var(--bg-accent);
		}
	}
</style>
