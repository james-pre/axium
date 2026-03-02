<script lang="ts">
	import { text } from '@axium/client';
	import Logout from '@axium/client/components/Logout';
</script>

<svelte:head>
	<title>{text('generic.logout')}</title>
</svelte:head>

<Logout fullPage />
