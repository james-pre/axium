<script lang="ts">
	/** From 0 to 1. Without a finite number, the ring spins instead. */
	const { value }: { value?: number | null } = $props();

	const measured = $derived(typeof value == 'number' && Number.isFinite(value));
</script>

<svg
	class={['ProgressRing', !measured && 'indeterminate']}
	viewBox="0 0 20 20"
	role="progressbar"
	aria-valuenow={measured ? Math.round(value! * 100) : undefined}
	aria-valuemin={0}
	aria-valuemax={100}
>
	<circle class="track" cx="10" cy="10" r="8" />
	<circle class="fill" cx="10" cy="10" r="8" pathLength="100" stroke-dasharray="{measured ? value! * 100 : 25} 100" />
</svg>

<style>
	.ProgressRing {
		width: var(--size, 1em);
		height: var(--size, 1em);
		flex-shrink: 0;
		rotate: -90deg;
	}

	circle {
		fill: none;
		stroke-width: 3;
	}

	.track {
		stroke: var(--bg-strong);
	}

	.fill {
		stroke: var(--fg-accent);
		stroke-linecap: round;
		transition: stroke-dasharray 0.5s;
	}

	.indeterminate {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			rotate: 270deg;
		}
	}
</style>
