<script lang="ts">
	import { preferenceLabels, preferenceSchemas, type PreferenceName, type Preferences } from '@axium/core';
	import Preference from './Preference.svelte';

	interface Props {
		userId: string;
		preferences: Preferences;
	}

	let { preferences = $bindable(), userId }: Props = $props();
	const id = $props.id();
</script>

{#each Object.keys(preferenceSchemas) as PreferenceName[] as path}
	<div class="pref">
		<label for={id}>{preferenceLabels[path]}</label>
		<Preference {userId} bind:preferences {path} schema={preferenceSchemas[path]} />
	</div>
{/each}

<style>
	.pref {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1em;
	}
</style>
