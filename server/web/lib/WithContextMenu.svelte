<script lang="ts">
	let { children, menu }: { children(): any; menu(): any } = $props();

	let active = $state(false);

	function oncontextmenu(event: MouseEvent) {
		event.preventDefault();
		active = true;
	}

	function onblur() {
		active = false;
	}
</script>

<div class="WithContextMenu" {oncontextmenu} tabindex="-1">
	{@render children()}

	{#if active}
		<div class="menu" {onblur} tabindex="-1">{@render menu()}</div>
	{/if}
</div>

<style>
	.WithContextMenu {
		display: contents;
	}

	.menu {
		position: absolute;
	}
</style>
