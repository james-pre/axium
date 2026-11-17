<script lang="ts">
	import * as timers from './timers.svelte.ts';
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
</script>

{#if timers.finished.size}
	<div class="timer-alerts" role="alert">
		{#each timers.finished.values() as timer (timer.id)}
			<div class="alert">
				<Icon i="bell" --size="1.25em" />
				<div class="text">
					<strong>{timer.label ?? text('ai.timer.title')}</strong>
					<span>{timer.message ?? text('ai.timer.done')}</span>
				</div>
				<button onclick={() => timers.dismiss(timer.id)}>{text('ai.timer.dismiss')}</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.timer-alerts {
		position: fixed;
		bottom: calc(1em + env(safe-area-inset-bottom, 0px));
		left: 50%;
		translate: -50% 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		width: min(24em, calc(100% - 2em));
	}

	.alert {
		display: flex;
		align-items: center;
		gap: 1em;
		padding: 0.75em 1em;
		border-radius: 1em;
		background-color: var(--bg-accent);
		box-shadow: 0 0.25em 1em #0006;

		.text {
			flex: 1;
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
	}
</style>
