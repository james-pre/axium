<script lang="ts">
	import { FormDialog } from '@axium/server/web/index.js';
	import Share from './Share.svelte';

	let { form, item, editable } = $props();
</script>

<FormDialog {form} action="?/shares" submitText="Save">
	{#each item.shares as share}
		<Share {share} {editable} />
	{/each}
</FormDialog>
