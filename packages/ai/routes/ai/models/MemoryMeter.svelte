<script lang="ts">
	import type * as ai from '@axium/ai/common';
	import { text } from '@axium/client';
	import { bytes } from 'utilium/format';

	const { memory, models }: { memory: ai.DRAM; models: ai.Model[] } = $props();

	const loaded = $derived(models.filter(model => model.memory?.current));

	interface Segment {
		label: string;
		size: number;
		kind: 'model' | 'other';
		index?: number;
	}

	/** Splits used memory into loaded models, when `showModels`, and everything else */
	function segments(device: ai.Device, kind: 'device' | 'host', showModels: boolean): Segment[] {
		const used: Segment[] = !showModels
			? []
			: loaded.map((model, index) => ({ label: model.name, size: model.memory!.current![kind], kind: 'model', index }));

		const ours = used.reduce((sum, segment) => sum + segment.size, 0);
		if (device.used !== undefined && device.used > ours) {
			used.push({ label: text('ai.memory.other'), size: device.used - ours, kind: 'other' });
		}
		return used.filter(segment => segment.size > 0);
	}

	function bar(device: ai.Device, kind: 'device' | 'host', showModels: boolean) {
		const parts = segments(device, kind, showModels);
		return { device, segments: parts, used: parts.reduce((sum, segment) => sum + segment.size, 0) };
	}

	const bars = $derived([
		...memory.devices.map(device => bar(device, 'device', memory.devices.length == 1)),
		bar({ ...memory.host, name: text('ai.memory.host') }, 'host', true),
	]);
</script>

<div class="MemoryMeter">
	{#each bars as { device, segments, used }}
		<div class="device">
			<div class="label">
				<span>{device.name}</span>
				<span class="subtle">{text('ai.memory.usage', { used: bytes(used), total: bytes(device.total) })}</span>
			</div>
			<div class="bar">
				{#each segments as segment}
					<div
						class={['segment', segment.kind]}
						style:width="{(segment.size / device.total) * 100}%"
						style:--index={segment.index ?? 0}
						title="{segment.label}: {bytes(segment.size)}"
					></div>
				{/each}
			</div>
		</div>
	{/each}

	{#if loaded.length}
		<div class="legend">
			{#each loaded as model, index}
				<span class="item"><span class="swatch segment model" style:--index={index}></span>{model.name}</span>
			{/each}
			<span class="item"><span class="swatch segment other"></span>{text('ai.memory.other')}</span>
		</div>
	{/if}
</div>

<style>
	.MemoryMeter {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
	}

	.label {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		margin-bottom: 0.25em;
	}

	.bar {
		display: flex;
		height: 0.75em;
		border-radius: 0.375em;
		background-color: var(--bg-strong);
		overflow: hidden;
	}

	.segment.model {
		background-color: hsl(from var(--fg-accent) calc(h + var(--index) * 67) 55 62);
	}

	.segment.other {
		background-color: hsl(0 0 50);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1em;
		font-size: 0.85em;
	}

	.item {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
	}

	.swatch {
		display: inline-block;
		width: 0.75em;
		height: 0.75em;
		border-radius: 0.2em;
	}
</style>
