<script lang="ts">
	const { min = 0, max, value, text } = $props();
</script>

<div class="Bar">
	<div class="fill" style="width: {((value - min) / (max - min)) * 100}%"></div>
	{#if text}
		<span class="text">{text}</span>
	{/if}
</div>

<style>
	.Bar {
		position: relative;
		border-radius: calc(var(--height, 1em) / 2);
		height: var(--height, 1em);
		background-color: #444;
	}

	.text {
		position: absolute;
		top: 0;
		left: 1em;
		width: fit-content;
		height: var(--height, 1em);
		line-height: 1;
	}

	.fill {
		border-radius: calc(var(--height, 1em) / 2);
		height: 100%;
		background-color: var(--fill, #465);
	}
</style>
