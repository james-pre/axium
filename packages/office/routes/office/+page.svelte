<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchAPI, text } from '@axium/client';
	import { Icon, Popover } from '@axium/client/components';
	import { toast } from '@axium/client/toast';
	import { icons, kinds, newFormats, type Kind } from '@axium/office/common';
	import DocumentCard from './DocumentCard.svelte';

	const { data } = $props();

	let items = $state(data.items);

	/** The localized "Untitled" name, numbered when the user already has one */
	function untitledName(kind: Kind): string {
		const base = text(`office.untitled.${kind}`);
		const names = new Set(items.map(item => item.name));

		for (let number = 1; ; number++) {
			const name = number == 1 ? base : `${base} ${number}`;
			if (!names.has(`${name}.${newFormats[kind].extension}`)) return name;
		}
	}

	async function create(kind: Kind) {
		try {
			const item = await fetchAPI('PUT', 'office', { kind, name: untitledName(kind) });
			await goto(`/office/${item.id}`);
		} catch (error) {
			toast('error', error);
		}
	}
</script>

<svelte:head>
	<title>{text('app_name.office')}</title>
</svelte:head>

<div id="office-main">
	<Popover>
		{#snippet toggle()}
			<button class="icon-text new">
				<Icon i="plus" />
				<span>{text('office.new')}</span>
			</button>
		{/snippet}
		{#each kinds as kind}
			<button class="reset menu-item" onclick={() => create(kind)}>
				<Icon i={icons[kind]} />
				<span>{text(`office.kind.${kind}`)}</span>
			</button>
		{/each}
	</Popover>

	{#if items.length}
		<div class="documents">
			{#each items as item, i (item.id)}
				<DocumentCard
					bind:item={items[i]}
					user={data.session.user}
					ontrash={() => (items = items.filter(other => other.id != item.id))}
				/>
			{/each}
		</div>
	{:else}
		<p class="subtle">{text('office.empty')}</p>
	{/if}
</div>

<style>
	#office-main {
		padding: 2em;
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 1.5em;
	}

	.documents {
		align-self: stretch;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16em, 1fr));
		gap: 1em;
	}

	@media (width < 700px) {
		#office-main {
			padding: 1em;
		}
	}
</style>
