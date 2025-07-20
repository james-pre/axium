<script lang="ts">
	import Icon from './Icon.svelte';

	const { children, toggle }: { children(): any; toggle?(): any } = $props();

	let enabled = $state(false);
	let menu = $state<HTMLDivElement>();

	$effect(() => {
		if (enabled) menu.focus();
	});
</script>

<div class="MenuToggle" bind:this={menu} onblur={() => (enabled = false)} tabindex="-1">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onclick={() => (enabled = !enabled)} class="toggle">
		{#if toggle}
			{@render toggle()}
		{:else}
			<Icon i="ellipsis" />
		{/if}
	</div>

	{#if enabled}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="menu"
			onclick={e => {
				if (e.target instanceof HTMLButtonElement) enabled = false;
			}}
		>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.MenuToggle {
		display: inline-block;
	}

	.toggle {
		cursor: pointer;
	}

	.menu {
		position: absolute;
		border: 1px solid #99a;
		background-color: #111;
		border-radius: 0.5em;
		padding: 0.5em;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
</style>
