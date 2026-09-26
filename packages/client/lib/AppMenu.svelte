<script lang="ts">
	import AppList from './AppList.svelte';
	import Icon from './Icon.svelte';
	import Popover from './Popover.svelte';
</script>

<Popover>
	{#snippet toggle()}
		<button style:display="contents">
			<Icon i="grid" --size="1.5em" />
		</button>
	{/snippet}

	<AppList />
</Popover>
