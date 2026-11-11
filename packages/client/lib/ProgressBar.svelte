<script lang="ts">
	/** From 0 to 1. Without a finite number, the bar shows activity instead. */
	const { value }: { value?: number | null } = $props();

	const measured = $derived(typeof value == 'number' && Number.isFinite(value));
</script>

<div
	class={['ProgressBar', !measured && 'indeterminate']}
	role="progressbar"
	aria-valuenow={measured ? Math.round(value! * 100) : undefined}
	aria-valuemin={0}
	aria-valuemax={100}
>
	<div class="fill" style:width={measured ? `${value! * 100}%` : undefined}></div>
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
			transition: width 0.5s;
		}
	}

	.indeterminate .fill {
		width: 30%;
		animation: slide 1.5s ease-in-out infinite;
	}

	@keyframes slide {
		from {
			translate: -100%;
		}

		to {
			translate: 340%;
		}
	}
</style>
