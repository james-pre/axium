<script lang="ts">
	import { text } from '@axium/client';
	import Register from '@axium/client/components/Register';
</script>

<svelte:head>
	<title>{text('generic.register')}</title>
</svelte:head>

<Register fullPage />
