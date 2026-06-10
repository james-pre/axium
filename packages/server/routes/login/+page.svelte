<script lang="ts">
	import { text } from '@axium/client';
	import Login from '@axium/client/components/Login';
</script>

<svelte:head>
	<title>{text('generic.login')}</title>
</svelte:head>

<Login fullPage />
