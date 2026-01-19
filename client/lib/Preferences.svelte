<script lang="ts">
	import { preferenceLabels, Preferences } from '@axium/core';
	import Preference from './Preference.svelte';

	interface Props {
		userId: string;
		preferences: Preferences;
	}

	let { preferences = $bindable(), userId }: Props = $props();
	const id = $props.id();
</script>

{#each Object.keys(Preferences.shape) as (keyof Preferences)[] as path}
	<div class="pref">
		<label for={id}>{preferenceLabels[path]}</label>
		<Preference {userId} bind:preferences {path} schema={Preferences.shape[path]} />
	</div>
{/each}

<style>
	.pref {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1em;
	}
</style>
