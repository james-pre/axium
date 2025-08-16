<script lang="ts">
	const { min = 0, max, value, text } = $props();
</script>

<div class="Bar">
	<div class="fill" style="width: {((value - min) / (max - min)) * 100}%"></div>
	{#if text}<span class="text">{text}</span>{/if}
</div>

<style>
	.Bar {
		position: relative;
		border-radius: calc(var(--height, 2em) / 2);
		height: var(--height, 2em);
		background-color: #444;
		overflow: hidden;
	}

	.text {
		position: absolute;
		inset: calc(calc(var(--height, 2em) - 1em) / 2) 1em;
		width: fit-content;
		line-height: 1;
	}

	.fill {
		border-radius: calc(var(--height, 2em) / 2);
		height: 100%;
		background-color: var(--fill, #465);
	}
</style>
