import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type { GPU, Memory, NetworkInterface, Storage, SystemInfo } from '../info.js';

/** Read a sysfs/procfs file, returning the trimmed contents or undefined if unreadable. */
function read(path: string): string | undefined {
	try {
		return fs.readFileSync(path, 'utf8').trim();
	} catch {
		return undefined;
	}
}

function list(path: string): string[] {
	try {
		return fs.readdirSync(path);
	} catch {
		return [];
	}
}

let pciDb: string | undefined;

/** Map `vendor:device` PCI IDs (lowercase hex) to a human-readable name using the system pci.ids database. */
function pciName(id: string): string {
	const [vendor, device] = id.toLowerCase().split(':');
	if (!pciDb) pciDb = read('/usr/share/hwdata/pci.ids') ?? read('/usr/share/misc/pci.ids');
	if (!pciDb || !vendor || !device) return id;

	let inVendor = false;
	for (const line of pciDb.split('\n')) {
		if (line.startsWith('#') || !line.trim()) continue;
		if (!line.startsWith('\t')) {
			// Vendor line: `1002  Advanced Micro Devices, Inc. [AMD/ATI]`
			inVendor = line.slice(0, 4).toLowerCase() === vendor;
			continue;
		}
		if (!inVendor || line.startsWith('\t\t')) continue;
		// Device line: `\t7550  Device name`
		const entry = line.slice(1);
		if (entry.slice(0, 4).toLowerCase() === device) return entry.slice(4).trim();
	}
	return id;
}

function gpus(): GPU[] {
	const seen = new Set<string>();
	const result: GPU[] = [];

	for (const card of list('/sys/class/drm')) {
		// Only whole cards (`card0`), not connectors (`card0-DP-1`) or render nodes.
		if (!/^card\d+$/.test(card)) continue;

		const uevent = read(`/sys/class/drm/${card}/device/uevent`);
		const id = uevent && /^PCI_ID=(.+)$/m.exec(uevent)?.[1];
		if (!id || seen.has(id)) continue;
		seen.add(id);

		// VRAM totals are exposed by some drivers (e.g. amdgpu) in bytes.
		const vramTotal = read(`/sys/class/drm/${card}/device/mem_info_vram_total`);
		const vramUsed = read(`/sys/class/drm/${card}/device/mem_info_vram_used`);
		const vram = vramTotal && vramUsed ? { total: BigInt(vramTotal), used: BigInt(vramUsed) } : undefined;

		result.push({ model: pciName(id), vram });
	}
	return result;
}

/** Map mounted block devices to the filesystem usage (bytes) of their mount point. */
function mountUsage(): Map<string, { total: bigint; used: bigint }> {
	const usage = new Map<string, { total: bigint; used: bigint }>();
	const mounts = read('/proc/mounts');
	if (!mounts) return usage;

	for (const line of mounts.split('\n')) {
		const [source, mountPoint] = line.split(' ');
		if (!source?.startsWith('/dev/')) continue;

		let stat: fs.StatsFsBase<bigint>;
		try {
			stat = fs.statfsSync(mountPoint, { bigint: true });
		} catch {
			continue;
		}

		const total = stat.blocks * stat.bsize;
		const used = (stat.blocks - stat.bfree) * stat.bsize;
		usage.set(source.slice('/dev/'.length), { total, used });
	}
	return usage;
}

function storage(): Storage[] {
	const usage = mountUsage();
	const result: Storage[] = [];

	for (const dev of list('/sys/block')) {
		// Skip virtual devices (zram, loop, device-mapper) which have no backing `device`.
		if (!fs.existsSync(`/sys/block/${dev}/device`)) continue;

		const sectors = read(`/sys/block/${dev}/size`);
		if (!sectors) continue;
		// `size` is always in 512-byte sectors regardless of logical block size.
		const total = BigInt(sectors) * 512n;

		// Sum filesystem usage across mounted partitions of this disk.
		let used = 0n;
		for (const [mounted, info] of usage) {
			if (mounted === dev || mounted.startsWith(dev + 'p') || (mounted.startsWith(dev) && /\d$/.test(mounted))) {
				used += info.used;
			}
		}

		const model = read(`/sys/block/${dev}/device/model`)?.trim() || dev;
		result.push({ model, total, used });
	}
	return result;
}

function memory(): Memory {
	const info: Record<string, bigint> = {};
	const content = read('/proc/meminfo');
	if (content)
		for (const line of content.split('\n')) {
			const match = /^(\w+):\s+(\d+)(?:\s+kB)?$/.exec(line.trim());
			if (!match) continue;
			const [, key, value] = match;
			info[key] = BigInt(value) * (line.endsWith('kB') ? 1024n : 1n);
		}

	const total = info.MemTotal ?? BigInt(os.totalmem());
	const available = info.MemAvailable ?? BigInt(os.freemem());

	const memory: Memory = {
		speed: 0,
		total,
		used: total - available,
	};

	const swapTotal = info.SwapTotal ?? 0n;
	if (swapTotal > 0n) memory.swap = { total: swapTotal, used: swapTotal - (info.SwapFree ?? 0n) };

	return memory;
}

function networkInterfaces(): NetworkInterface[] {
	const result: NetworkInterface[] = [];

	for (const name of list('/sys/class/net')) {
		if (name === 'lo' || name.startsWith('veth') || name.startsWith('docker') || name.startsWith('br-')) continue;

		const operstate = read(`/sys/class/net/${name}/operstate`);
		const connected = operstate === 'up' || read(`/sys/class/net/${name}/carrier`) === '1';

		const raw = Number(read(`/sys/class/net/${name}/speed`));
		let speed = connected && Number.isSafeInteger(raw) && raw > 0 ? raw : undefined;

		const wireless = fs.existsSync(`/sys/class/net/${name}/wireless`) || fs.existsSync(`/sys/class/net/${name}/phy80211`);

		// Wi-Fi doesn't expose sysfs `speed`; the SSID and link bitrate come from `iw` instead.
		let connection: string | undefined;
		if (wireless && connected)
			try {
				const link = execFileSync('iw', ['dev', name, 'link'], { encoding: 'utf8' });
				connection = /^\s*SSID:\s*(.+)$/m.exec(link)?.[1].trim() || undefined;
				const bitrate = /^\s*tx bitrate:\s*([\d.]+)\s*MBit\/s/m.exec(link)?.[1];
				if (bitrate) speed = Math.round(Number(bitrate));
			} catch {
				// that's okay
			}

		const uevent = read(`/sys/class/net/${name}/device/uevent`);
		const id = uevent && /^PCI_ID=(.+)$/m.exec(uevent)?.[1];
		const model = id ? pciName(id) : name;

		result.push({ name, model, connected, wireless, connection, speed });
	}
	return result;
}

export function systemInfo(): SystemInfo {
	return {
		cpus: Object.entries(Object.groupBy(os.cpus(), cpu => cpu.model)).map(([model, info]) => ({ model, cores: info?.length || 1 })),
		gpus: gpus(),
		memory: memory(),
		storage: storage(),
		networkInterfaces: networkInterfaces(),
		arch: os.arch(),
		machine: os.machine(),
		platform: os.platform(),
		release: os.release(),
		type: os.type(),
		uptime: os.uptime(),
		version: os.version(),
		hostname: os.hostname(),
		user: os.userInfo(),
	};
}
