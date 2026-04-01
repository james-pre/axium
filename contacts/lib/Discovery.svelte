<script lang="ts">
	import { text } from '@axium/client';
	import { fetchAPI } from '@axium/client/requests';
	import type { NoExternal } from '@axium/contacts';
	import { name } from '@axium/contacts/format';
	import { errorText } from 'ioium';

	const { onSelect, exclude = [] }: { onSelect(id: string): unknown; exclude?: string[] } = $props();

	let results = $state<NoExternal[]>([]),
		value = $state<string>(),
		gotError = $state<boolean>(false);

	async function oninput() {
		if (!value || !value.length) {
			results = [];
			return;
		}

		try {
			results = await fetchAPI('POST', 'contact-discovery', value);
		} catch (e) {
			gotError = true;
			console.warn('Can not use contact discovery:', errorText(e));
			results = [];
		}
	}

	function select(target: NoExternal) {
		return (e: Event) => {
			e.stopPropagation();
			onSelect(target.id);
			results = [];
			value = name(target);
		};
	}
</script>

<input bind:value type="text" placeholder={text('contacts.Discovery.placeholder')} {oninput} />
{#if !gotError && value}
	<!-- Don't show results when we can't use the discovery API -->
	<div class="results">
		{#each results as result}
			{#if !exclude.includes(result.id)}
				<div class="result" onclick={select(result)}>
					<span>{name(result)}</span>
				</div>
			{/if}
		{:else}
			<i>{text('contacts.Discovery.no_results')}</i>
		{/each}
	</div>
{/if}

<style>
	:host {
		anchor-scope: --discovery-input;
	}

	input {
		anchor-name: --discovery-input;
	}

	input:focus + .results,
	.results:active {
		display: flex;
		animation: var(--A-zoom);
	}

	.results {
		position: fixed;
		position-anchor: --discovery-input;
		inset: anchor(bottom) anchor(right) auto anchor(left);
		display: none;
		flex-direction: column;
		gap: 0.25em;
		height: fit-content;
		max-height: 25em;
		background-color: var(--bg-accent);
		border-radius: 0.25em 0.25em 0.75em 0.75em;
		padding: 1em;
		border: var(--border-accent);
		align-items: stretch;

		i {
			text-align: center;
		}
	}

	.result {
		padding: 0.25em 0.75em;
		border-radius: 0.5em;
		display: inline-flex;
		align-items: center;
	}

	.result:hover {
		cursor: pointer;
		background-color: var(--bg-strong);
	}
</style>
