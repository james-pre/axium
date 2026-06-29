<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { Icon, NumberBar } from '@axium/client/components';
	import { connect } from '@axium/client/socket';
	import { toastStatus } from '@axium/client/toast';
	import { formatBytes, formatDuration } from '@axium/core';
	import { systemTypeIcons, type SystemInfo } from '@axium/sysadmin';
	import '@axium/sysadmin/common';

	const { data } = $props();

	let system = $state(data.system);
	const systemUsers = data.systemUsers;

	let info = $state<SystemInfo>();
	let error = $state(false);
	let loading = $state(true);

	const matchingUser = $derived(info && systemUsers.find(u => u.username === info!.user.username));
	const connectedUser = $derived(system.connectedUserId ? systemUsers.find(u => u.id === system.connectedUserId) : undefined);

	async function setConnectedUser(connectedUserId: string | null) {
		const updated = await fetchAPI('PATCH', 'sysadmin/systems/:id', { ...system, connectedUserId }, system.id);
		system = updated;
	}

	/** The fraction used, for a NumberBar, clamped to [0, 1]. */
	function fraction(used: bigint, total: bigint): number {
		if (total <= 0n) return 0;
		return Math.min(1, Number(used) / Number(total));
	}

	function usageText(used: bigint, total: bigint): string {
		if (used <= 0n) return formatBytes(total);
		return text('sysadmin.system.usage', { used: formatBytes(used), total: formatBytes(total) });
	}

	const socket = await connect();

	async function loadInfo() {
		try {
			const all = await socket.emitWithAck('sysadmin:getSystemInfo');
			info = all.find(i => i.hostname === system.hostname);
			error = !info;
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
	<a class="subtle icon-text back" href="/sysadmin">
		<Icon i="arrow-left" />
		<span>{text('sysadmin.back_to_main')}</span>
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
				<h3>
					<Icon i="memory" />
					{text('sysadmin.system.memory')}
					{#if info.memory.type}
						<span class="subtle">{info.memory.type}</span>
					{/if}
					{#if info.memory.formFactor}
						<span class="subtle">{info.memory.formFactor}</span>
					{/if}
					{#if info.memory.speed}
						<span class="subtle">{text('sysadmin.system.memory_speed', { speed: info.memory.speed })}</span>
					{/if}
				</h3>
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
						<div class="net-line">
							<span class="icon-text net-name">
								<Icon i={iface.wireless ? 'wifi' : 'ethernet'} />
								{iface.name}
							</span>
							<span class="subtle net-model">{iface.model}</span>
							<span class="net-state">
								<span class={['net-status', iface.connected ? 'online' : 'offline']}>
									{iface.connected ? text('sysadmin.system.connected') : text('sysadmin.system.disconnected')}
									{#if iface.connection}
										<span class="subtle">{text('sysadmin.system.connected_to', { connection: iface.connection })}</span>
									{/if}
								</span>
								{#if iface.speed}
									<span class="subtle"
										>{iface.speed < 1000
											? `${iface.speed} MBit/s`
											: `${(iface.speed / 1000).toFixed(2).replace(/\.?0+$/, '')} GBit/s`}</span
									>
								{/if}
							</span>
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

	{#if info || connectedUser}
		<section>
			{const userIcon = !info ? 'user' : info.user.uid === 0 ? 'user-crown' : info.user.uid < 1000 ? 'user-gear' : 'user'}
			<h2><Icon i={userIcon} /> {text('sysadmin.system.user.title')}</h2>

			{#if info && connectedUser && connectedUser.username !== info.user.username}
				<div class="warning icon-text">
					<Icon i="triangle-exclamation" />
					<span>
						{text('sysadmin.system.user.username_mismatch', {
							connected: connectedUser.username,
							live: info.user.username,
						})}
					</span>
				</div>
			{/if}

			{#if info}
				<dl>
					<dt>{text('sysadmin.system.user.username')}</dt>
					<dd>{info.user.username}</dd>
					<dt>{text('sysadmin.system.user.uid')}</dt>
					<dd>{info.user.uid} <span class="subtle">/ {info.user.gid}</span></dd>
					<dt>{text('sysadmin.system.user.home')}</dt>
					<dd>{info.user.homedir}</dd>
					{#if info.user.shell}
						<dt>{text('sysadmin.system.user.shell')}</dt>
						<dd>{info.user.shell}</dd>
					{/if}
				</dl>
			{/if}

			<div class="user-connection">
				{#if connectedUser}
					<a class="icon-text subtle" href="/sysadmin/users/{connectedUser.id}">
						<Icon i="link" />
						<span>{text('sysadmin.system.user.connected_to', connectedUser)}</span>
					</a>
					<button
						class="icon-text"
						onclick={() => toastStatus(setConnectedUser(null), text('sysadmin.system.user.disconnected_from', connectedUser))}
					>
						<Icon i="link-slash" />
						<span>{text('sysadmin.system.user.disconnect')}</span>
					</button>
				{:else if matchingUser}
					<span class="subtle">{text('sysadmin.system.user.match_found', matchingUser)}</span>
					<button
						class="icon-text"
						onclick={() =>
							toastStatus(setConnectedUser(matchingUser.id), text('sysadmin.system.user.connected_to', matchingUser))}
					>
						<Icon i="link" />
						<span>{text('sysadmin.system.user.connect')}</span>
					</button>
				{:else}
					<span class="subtle">{text('sysadmin.system.user.no_match')}</span>
				{/if}
			</div>
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

	.net-line {
		display: flex;
		align-items: center;
		gap: 0.5em 1em;
		flex-wrap: wrap;
	}

	.net-name {
		font-weight: bold;
	}

	/* Push the status/speed cluster to the trailing edge; let the model take the slack. */
	.net-model {
		margin-right: auto;
	}

	.net-state {
		display: inline-flex;
		align-items: center;
		gap: 0.35em 0.75em;
		flex-wrap: wrap;
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

	.user-connection {
		display: flex;
		align-items: center;
		gap: 1em;
		flex-wrap: wrap;

		button {
			margin-left: auto;
		}
	}

	@media (width < 700px) {
		.system-page {
			padding: 1em;
			padding-bottom: 5em;
		}

		.net-model {
			flex-basis: 100%;
		}
	}
</style>
