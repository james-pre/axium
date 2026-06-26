<script lang="ts">
	import { text } from '@axium/client';
	import { formatBytes, formatDuration } from '@axium/core';
	import { Icon, NumberBar } from '@axium/client/components';
	import { connect } from '@axium/client/socket';
	import { systemTypeIcons, type SystemInfo } from '@axium/sysadmin';
	import '@axium/sysadmin/common';

	const { data } = $props();
	const system = data.system;

	let info = $state<SystemInfo>();
	let error = $state(false);
	let loading = $state(true);

	/** The fraction used, for a NumberBar, clamped to [0, 1]. */
	function fraction(used: bigint, total: bigint): number {
		if (total <= 0n) return 0;
		return Math.min(1, Number(used) / Number(total));
	}

	function usageText(used: bigint, total: bigint): string {
		return text('sysadmin.system.usage', { used: formatBytes(used), total: formatBytes(total) });
	}

	function speedText(speed: number): string {
		if (speed < 1000) return `${speed} MBit/s`;
		const gb = speed / 1000;
		return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GBit/s`;
	}

	const socket = await connect();

	async function loadInfo() {
		try {
			const all = await socket.emitWithAck('sysadmin:getSystemInfo');
			info = all.find(i => i.hostname === system.hostname);
			if (!info) error = true;
		} catch {
			error = true;
		} finally {
			loading = false;
		}
	}

	setInterval(loadInfo, 2500);

	$effect(() => void loadInfo());
</script>

<svelte:head>
	<title>{text('sysadmin.system.page_title', system)}</title>
</svelte:head>

<div class="system-page">
	<a class="subtle icon-text back" href="/sysadmin/systems">
		<Icon i="arrow-left" />
		<span>{text('sysadmin.back_to_systems')}</span>
	</a>

	<div class="system-header">
		<Icon i={systemTypeIcons[system.type]} --size="3em" />
		<div>
			<h1>{system.name}</h1>
			<span class="subtle">{system.hostname}</span>
		</div>
		<span class={['status', info ? 'online' : 'offline']}>
			<Icon i={info ? 'circle-check' : 'circle-xmark'} />
			{info ? text('sysadmin.online') : text('sysadmin.offline')}
		</span>
	</div>

	{#if loading}
		<p class="subtle">{text('sysadmin.system.loading_info')}</p>
	{:else if error}
		<div class="notice">
			<p class="subtle">{text('sysadmin.system.info_error')}</p>
			<button class="icon-text" onclick={loadInfo}>
				<Icon i="rotate-right" />
				<span>{text('sysadmin.system.refresh')}</span>
			</button>
		</div>
	{:else if info}
		<section>
			<h2><Icon i="microchip" /> {text('sysadmin.system.hardware')}</h2>

			<div class="component">
				<h3><Icon i="microchip" /> {text('sysadmin.system.cpu')}</h3>
				{#each info.cpus as cpu}
					<div class="line">
						<span>{cpu.model}</span>
						<span class="subtle">{text('sysadmin.system.cpu_cores', { count: cpu.cores })}</span>
					</div>
				{/each}
			</div>

			{#if info.gpus.length}
				<div class="component">
					<h3><Icon i="display" /> {text('sysadmin.system.gpu')}</h3>
					{#each info.gpus as gpu}
						<div class="line">
							<span>{gpu.model}</span>
						</div>
						{#if gpu.vram}
							<NumberBar
								value={fraction(gpu.vram.used, gpu.vram.total)}
								max={1}
								text={usageText(gpu.vram.used, gpu.vram.total)}
							/>
						{/if}
					{/each}
				</div>
			{/if}

			<div class="component">
				<h3><Icon i="memory" /> {text('sysadmin.system.memory')}</h3>
				<NumberBar
					value={fraction(info.memory.used, info.memory.total)}
					max={1}
					text={usageText(info.memory.used, info.memory.total)}
				/>
				{#if info.memory.swap}
					<span class="subtle">{text('sysadmin.system.swap')}</span>
					<NumberBar
						value={fraction(info.memory.swap.used, info.memory.swap.total)}
						max={1}
						text={usageText(info.memory.swap.used, info.memory.swap.total)}
					/>
				{/if}
			</div>

			{#if info.storage.length}
				<div class="component">
					<h3><Icon i="hard-drive" /> {text('sysadmin.system.storage')}</h3>
					{#each info.storage as disk}
						<div class="line">
							<span>{disk.model}</span>
						</div>
						<NumberBar value={fraction(disk.used, disk.total)} max={1} text={usageText(disk.used, disk.total)} />
					{/each}
				</div>
			{/if}

			{#if info.networkInterfaces.length}
				<div class="component">
					<h3><Icon i="network-wired" /> {text('sysadmin.system.network')}</h3>
					{#each info.networkInterfaces as iface}
						<div class="line">
							<span class="icon-text">
								<Icon i={iface.wireless ? 'wifi' : 'ethernet'} />
								{iface.name}
							</span>
							<span class="subtle">{iface.model}</span>
							<span class={['net-status', iface.connected ? 'online' : 'offline']}>
								{iface.connected ? text('sysadmin.system.connected') : text('sysadmin.system.disconnected')}
								{#if iface.connection}
									<span class="subtle">{text('sysadmin.system.connected_to', { connection: iface.connection })}</span>
								{/if}
							</span>
							{#if iface.speed}
								<span class="subtle">{speedText(iface.speed)}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<section>
			<h2><Icon i="layer-group" /> {text('sysadmin.system.os')}</h2>
			<dl>
				<dt>{text('sysadmin.system.platform')}</dt>
				<dd>{info.type} <span class="subtle">({info.platform})</span></dd>
				<dt>{text('sysadmin.system.release')}</dt>
				<dd>{info.release} <span class="subtle">{info.version}</span></dd>
				<dt>{text('sysadmin.system.arch')}</dt>
				<dd>{info.arch} <span class="subtle">({info.machine})</span></dd>
				<dt>{text('sysadmin.system.uptime')}</dt>
				<dd>{formatDuration(info.uptime)}</dd>
			</dl>
		</section>
	{/if}
</div>

<style>
	.system-page {
		padding: 2em;
		display: flex;
		flex-direction: column;
		gap: 1.5em;
	}

	.back {
		width: fit-content;
	}

	.system-header {
		display: flex;
		align-items: center;
		gap: 1em;
	}

	.system-header :global(.Icon) {
		flex-shrink: 0;
	}

	.system-header h1 {
		margin: 0;
	}

	.status,
	.net-status {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}

	.status {
		margin-left: auto;
	}

	.online {
		--fill: var(--green);
		color: var(--green);
	}

	.offline {
		--fill: hsl(0 0 var(--fg-light));
		color: hsl(0 0 var(--fg-light));
	}

	.notice {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		align-items: flex-start;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 1em;

		h2 {
			margin: 0;
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
	}

	.component {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		padding: 1em;
		border-radius: 0.5em;
		background-color: var(--bg-alt);

		h3 {
			margin: 0;
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
	}

	.line {
		display: flex;
		align-items: center;
		gap: 1em;
		flex-wrap: wrap;
		.subtle {
			margin-right: auto;
		}
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5em 2em;
		margin: 0;
	}

	dt {
		font-weight: bold;
	}

	dd {
		margin: 0;
	}

	@media (width < 700px) {
		.system-page {
			padding: 1em;
			padding-bottom: 5em;
		}
	}
</style>
