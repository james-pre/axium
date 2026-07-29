<script lang="ts">
	/** How far through the item the viewer is, from 0 to 1 */
	const { value }: { value: number } = $props();
</script>

<div class="ProgressBar" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
	<div class="fill" style:width="{value * 100}%"></div>
</div>

<style>
	.ProgressBar {
		height: 3px;
		border-radius: 2px;
		background-color: var(--bg-strong);
		overflow: hidden;

		.fill {
			height: 100%;
			background-color: var(--fg-accent);
		}
	}
</style>
