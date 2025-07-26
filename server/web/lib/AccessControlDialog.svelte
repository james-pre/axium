<script lang="ts">
	import FormDialog from './FormDialog.svelte';
	import AccessControl from './AccessControl.svelte';

	let { item, editable } = $props();
</script>

<FormDialog submitText="Save">
	{#each item.acl as control}
		<AccessControl {control} {editable} />
	{/each}
</FormDialog>
