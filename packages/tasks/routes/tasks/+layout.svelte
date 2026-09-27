<script lang="ts">
	import { text } from '@axium/client';
	import { TopBarContent } from '@axium/client/components';

	const { children } = $props();
</script>

<TopBarContent name={text('app_name.tasks')} icon="list-check" href="/tasks" />

{@render children()}
