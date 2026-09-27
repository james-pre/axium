<script lang="ts">
	import { text } from '@axium/client';
	import { TopBarContent } from '@axium/client/components';

	const { children } = $props();
</script>

<TopBarContent name={text('UserMenu.account')} icon="user" href="/account" />

{@render children()}
