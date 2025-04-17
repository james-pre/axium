<script lang="ts">
	import FormDialog from './FormDialog.svelte';
	import './styles.css';
	let { form } = $props();
</script>

<FormDialog pageMode={true} {form} submitText="Sign Up">
	<div>
		<label for="name">Display Name</label>
		<input name="name" type="text" value={form?.name || ''} required />
	</div>
	<div>
		<label for="email">Email</label>
		<input name="email" type="email" value={form?.email || ''} required />
	</div>
	<div>
		<label for="password">Password</label>
		<input name="password" type="password" />
	</div>
</FormDialog>
