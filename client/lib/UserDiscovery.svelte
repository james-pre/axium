<script lang="ts">
	import { text } from '@axium/client';
	import { fetchAPI } from '@axium/client/requests';
	import { getUserImage, type UserPublic } from '@axium/core';
	import { colorHashRGB } from '@axium/core/color';
	import { errorText } from '@axium/core/io';
	import Icon from './Icon.svelte';

	const {
		onSelect,
		enableTags = false,
		excludeTargets = [],
		noRoles = false,
		allowExact,
	}: {
		onSelect(target: string): unknown;
		enableTags?: boolean;
		excludeTargets?: string[];
		noRoles?: boolean;
		allowExact?: boolean;
	} = $props();

	type Result = { type: 'user'; value: UserPublic; target: string } | { type: 'role' | 'tag' | 'exact'; value: string; target: string };
	let results = $state<Result[]>([]);
	let value = $state<string>();
	let gotError = $state<boolean>(false);

	async function oninput() {
		if (!value || !value.length) {
			results = [];
			return;
		}

		try {
			const users = await fetchAPI('POST', 'users/discover', value);
			results = [
				allowExact && ({ type: 'exact', value, target: value } as const),
				...users.map(value => ({ type: 'user', value, target: value.id }) as const),
				!noRoles && ({ type: 'role', value, target: '@' + value } as const),
				enableTags && ({ type: 'tag', value, target: '#' + value } as const),
			].filter<Result>(r => !!r);
		} catch (e) {
			gotError = true;
			console.warn('Can not use user discovery:', errorText(e));
			results = [];
		}
	}

	function select(target: string) {
		return (e: Event) => {
			e.stopPropagation();
			onSelect(target);
			results = [];
			value = '';
		};
	}
</script>

<input bind:value type="text" placeholder={text('component.UserDiscovery.placeholder')} {oninput} />
{#if !gotError && value}
	<!-- Don't show results when we can't use the discovery API -->
	<div class="results">
		{#each results as result}
			{#if !excludeTargets.includes(result.target)}
				<div class="result" onclick={select(result.target)}>
					{#if result.type == 'user'}
						<span><img src={getUserImage(result.value)} alt={result.value.name} />{result.value.name}</span>
					{:else if result.type == 'role'}
						<span>
							<span class="icon-text tag-or-role" style:background-color={colorHashRGB(result.value)}
								><Icon i="at" />{result.value}</span
							>
						</span>
					{:else if result.type == 'tag'}
						<span>
							<span class="icon-text tag-or-role" style:background-color={colorHashRGB(result.value)}
								><Icon i="hashtag" />{result.value}</span
							>
						</span>
					{:else if result.type == 'exact'}
						<span class="non-user">{result.value}</span>
					{/if}
				</div>
			{/if}
		{:else}
			<i>{text('component.UserDiscovery.no_results')}</i>
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
		padding: 0.5em;
		border-radius: 0.5em;

		.non-user {
			border-radius: 1em;
			padding: 0.25em 0.75em;
			display: inline-flex;
			align-items: center;
			gap: 0.25em;
		}
	}

	.result:hover {
		cursor: pointer;
		background-color: var(--bg-strong);
	}

	img {
		width: 2em;
		height: 2em;
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 0.5em;
	}
</style>
