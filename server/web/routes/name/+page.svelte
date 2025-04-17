<script lang="ts">
	import { goto } from '$app/navigation';
	import FormDialog from '../../lib/FormDialog.svelte';
	import '../../lib/styles.css';
	let { form, data } = $props();
	$effect(() => {
		if (form?.success) goto('/');
	});
</script>

<svelte:head>
	<title>Edit Name</title>
</svelte:head>

<FormDialog pageMode={true} {form} submitText="Change">
	<div>
		<label for="name">What do you want to be called?</label>
		<input name="name" type="text" value={form?.name || data.session.user.name || ''} required />
	</div>
</FormDialog>
