<script lang="ts">
	import { text } from '@axium/client';
	import { AppPreferences } from '@axium/client/components';
	import { UserStoragePreferences } from '@axium/storage/common';

	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.files.settings.title')}</title>
</svelte:head>

<AppPreferences userId={data.session.userId} appId="files" schema={UserStoragePreferences} />
