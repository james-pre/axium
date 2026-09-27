<script lang="ts">
	import { text } from '@axium/client';
	import { TopBarContent } from '@axium/client/components';

	const { children } = $props();
</script>

<TopBarContent name={text('app_name.calendar')} icon="calendar" href="/calendar" />

{@render children()}
