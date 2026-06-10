<script lang="ts">
	import { text } from '@axium/client';
	import { AppPreferences } from '@axium/client/components';
	import { StoragePreferences } from '@axium/storage/common';

	const { data } = $props();

	if (!data.session) location.href = '/login?after=/files/settings';
</script>

<svelte:head>
	<title>{text('page.files.settings.title')}</title>
</svelte:head>

<AppPreferences userId={data.session!.userId} appId="files" schema={StoragePreferences} />
