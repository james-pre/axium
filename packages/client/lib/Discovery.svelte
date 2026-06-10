<script lang="ts" module>
	import { fetchAPI } from '@axium/client';
	import type { UserPublic } from '@axium/core';

	export interface Source<T> {
		name: string;
		get(search: string): T[] | Promise<T[]>;
		render: Snippet<[T]>;
	}

	// built-in / common discovery sources
	// note getters are used because svelte declares the snippets after the module script

	export const user: Source<{ type: 'user'; user: UserPublic; target: string }> = {
		name: 'user',
		async get(value) {
			const users = await fetchAPI('POST', 'users/discover', value);
			return users.map(user => ({ type: 'user', user, target: user.id }));
		},
		get render() {
			return renderUser;
		},
	};

	export const role: Source<{ type: 'role'; role: string; target: string }> = {
		name: 'role',
		get: role => [{ type: 'role', role, target: '@' + role }],
		get render() {
			return renderRole;
		},
	};

	export const exact: Source<{ type: 'exact'; target: string }> = {
		name: 'exact',
		get: value => [{ type: 'exact', target: value }],
		get render() {
			return renderExact;
		},
	};
</script>

<script lang="ts" generics="T extends any[]">
	import { text } from '@axium/client';
	import { errorText } from 'ioium';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import UserCard from './UserCard.svelte';

	type Value = T[keyof T & number];

	let {
		onSelect,
		sources,
		exclude,
		placeholder,
		initialValue = '',
	}: {
		onSelect(target: Value): string | void | Promise<string | void>;
		sources: { [K in keyof T]: Source<T[K]> };
		exclude?(target: Value): boolean;
		placeholder?: string;
		initialValue?: string;
	} = $props();

	type Result = { [K in keyof T]: { value: T[K]; snippet: Snippet<[T[K]]> } }[keyof T];
	let results = $state<Result[]>([]),
		value = $state<string>(initialValue),
		gotErrors = $state<Record<string, boolean>>({});

	const allError = $derived(Object.values(gotErrors).every(v => v));

	async function oninput() {
		results = [];
		if (!value || !value.length) return;

		for (const source of sources) {
			if (gotErrors[source.name]) continue;

			try {
				for (const result of await source.get(value)) {
					if (exclude?.(result)) continue;
					results.push({ value: result, snippet: source.render });
				}
				gotErrors[source.name] = false;
			} catch (e) {
				console.warn(`Can not discover ${source.name}:`, errorText(e));
				gotErrors[source.name] = true;
			}
		}
	}

	function select(target: Value) {
		return async (e: Event) => {
			e.stopPropagation();
			try {
				value = (await onSelect(target)) || '';
			} catch (e) {
				console.log('onSelect error:', e);
			}
			results = [];
		};
	}
</script>

{#snippet renderUser({ user }: { user: UserPublic; target: string })}
	<UserCard {user} />
{/snippet}

{#snippet renderRole({ role }: { role: string; target: string })}
	<span class="icon-text"><Icon i="at" />{role}</span>
{/snippet}

{#snippet renderExact(result: { target: string })}
	<span>{result.target}</span>
{/snippet}

<input bind:value type="text" {placeholder} {oninput} />
{#if !allError && value}
	<div class="results">
		{#each results as { value, snippet }}
			<div class="result" onclick={select(value)}>{@render snippet(value)}</div>
		{:else}
			<i>{text('Discovery.no_results')}</i>
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
		border-radius: 1em;
		padding: 0.25em 0.75em;
		gap: 0.25em;
		display: inline-flex;
		align-items: center;

		:global(& > *) {
			padding: 0.5em;
		}
	}

	.result:hover {
		cursor: pointer;
		background-color: var(--bg-strong);
	}
</style>
