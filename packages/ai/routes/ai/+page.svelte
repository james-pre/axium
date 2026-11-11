<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { Composer } from '@axium/ai/components';
	import { fetchAPI, text } from '@axium/client';
	import { toast } from '@axium/client/toast';

	const { data } = $props();

	let model = $state(data.models.default ?? data.models.models[0]?.id ?? '');
	let reasoning = $state('default');

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
	<title>{text('app_name.ai')}</title>
</svelte:head>

<div class="start">
	<h2>{text('ai.empty')}</h2>
	<Composer models={data.models.models} bind:model bind:reasoning onsend={start} />
</div>

<style>
	.start {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1em;
		height: 100%;
		padding: 1em;
	}
</style>
