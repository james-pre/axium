<script lang="ts">
	import { text } from '@axium/client/locales';
	import AppList from './AppList.svelte';
	import Icon from './Icon.svelte';
	import Popover from './Popover.svelte';
</script>

<Popover class="mobile-top">
	{#snippet toggle()}
		<button class="AppMenu reset" aria-label={text('AppMenu.label')}>
			<Icon i="grid" --size="1.5em" />
		</button>
	{/snippet}

	<AppList />
</Popover>

<style>
	.AppMenu {
		display: inline-flex;
	}
</style>
