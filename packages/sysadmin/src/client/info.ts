import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GPU, Memory, NetworkInterface, Storage, StorageDevice, StorageVolume, SystemInfo } from '../info.js';

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

/** PCIe generations by their per-lane transfer rate in GT/s, as reported by `current_link_speed`. */
const pcieGenerations: Record<string, string> = {
	'2.5': '1.0',
	'5.0': '2.0',
	'8.0': '3.0',
	'16.0': '4.0',
	'32.0': '5.0',
	'64.0': '6.0',
	'128.0': '7.0',
};

/** Format a link rate given in Mbit/s, e.g. 10000 -> '10 Gbps'. */
function formatLinkRate(mbps: number): string {
	return mbps >= 1000 ? `${(mbps / 1000).toFixed(1).replace(/\.0$/, '')} Gbps` : `${mbps} Mbps`;
}

/** The SATA link speed of an `ataN` device directory, e.g. '6.0 Gbps'. */
function sataSpeed(ata: string): string | undefined {
	for (const link of list(ata)) {
		if (!link.startsWith('link')) continue;
		for (const classLink of list(`${ata}/${link}/ata_link`)) {
			const speed = read(`${ata}/${link}/ata_link/${classLink}/sata_spd`);
			// Reported as `<unknown>` for PATA links and for ports with nothing negotiated.
			if (speed && !speed.startsWith('<')) return speed;
		}
	}
}

/** How a disk is attached, e.g. 'PCIe 4.0 x4', 'SATA 6.0 Gbps' or 'USB 10 Gbps'. */
function diskInterface(dev: string): string | undefined {
	let dir: string;
	try {
		dir = fs.realpathSync(`/sys/block/${dev}/device`);
	} catch {
		return undefined;
	}

	// Walk toward the root of the device tree; the nearest bus we recognize is the one the disk hangs off.
	for (; dir.startsWith('/sys/devices/'); dir = path.dirname(dir)) {
		const name = path.basename(dir);

		if (/^ata\d+$/.test(name)) {
			const speed = sataSpeed(dir);
			return speed ? `SATA ${speed}` : 'SATA';
		}

		// PCI(e) endpoints expose the negotiated link; `current_link_speed` is like `16.0 GT/s PCIe`.
		const link = read(`${dir}/current_link_speed`);
		if (link) {
			const rate = link.split(' ')[0];
			const generation = pcieGenerations[Number(rate).toFixed(1)];
			const width = read(`${dir}/current_link_width`);
			return `PCIe ${generation ?? `${rate} GT/s`}${width && width !== '0' ? ` x${width}` : ''}`;
		}

		// USB devices (as opposed to their interfaces) carry the descriptor fields; `speed` is in Mbit/s.
		if (fs.existsSync(`${dir}/idVendor`)) {
			const speed = Number(read(`${dir}/speed`));
			return speed > 0 ? `USB ${formatLinkRate(speed)}` : 'USB';
		}
	}
}

function devices(): StorageDevice[] {
	const result: StorageDevice[] = [];

	for (const name of list('/sys/block')) {
		// Skip virtual devices (zram, loop, device-mapper, MD) which have no backing `device`.
		if (!fs.existsSync(`/sys/block/${name}/device`)) continue;

		const sectors = read(`/sys/block/${name}/size`);
		if (!sectors) continue;

		result.push({
			name,
			model: read(`/sys/block/${name}/device/model`)?.trim() || name,
			size: BigInt(sectors) * 512n,
			interface: diskInterface(name),
			rotational: read(`/sys/block/${name}/queue/rotational`) === '1',
			removable: read(`/sys/block/${name}/removable`) === '1',
		});
	}

	return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a block device to the physical disks backing it, recursing through `slaves` so
 * device-mapper (LVM, LUKS) and MD stacks resolve to real hardware rather than virtual devices.
 */
function physicalDisks(dev: string, into = new Set<string>()): Set<string> {
	if (fs.existsSync(`/sys/class/block/${dev}/partition`)) {
		// Partitions live inside their disk's directory: `.../nvme0n1/nvme0n1p3`.
		try {
			return physicalDisks(path.basename(path.dirname(fs.realpathSync(`/sys/class/block/${dev}`))), into);
		} catch {
			return into;
		}
	}

	if (fs.existsSync(`/sys/block/${dev}/device`)) into.add(dev);
	else for (const slave of list(`/sys/block/${dev}/slaves`)) physicalDisks(slave, into);

	return into;
}

interface Btrfs {
	fsid: string;
	/** Member devices, as they are named in /sys/block */
	devices: string[];
	profile?: string;
}

/** BTRFS filesystems keyed by each of their member devices. The kernel is the only source that knows all members. */
function btrfsFilesystems(): Map<string, Btrfs> {
	const result = new Map<string, Btrfs>();

	for (const fsid of list('/sys/fs/btrfs')) {
		const devices = list(`/sys/fs/btrfs/${fsid}/devices`);
		if (!devices.length) continue;

		// `allocation/data` holds a directory per chunk profile in use alongside its counter files.
		const profile = list(`/sys/fs/btrfs/${fsid}/allocation/data`).find(entry => /^(single|dup|raid\d+(c\d+)?)$/.test(entry));

		const info: Btrfs = { fsid, devices, profile: profile === 'single' ? undefined : profile };
		for (const dev of devices) result.set(dev, info);
	}

	return result;
}

function volumes(): StorageVolume[] {
	const mounts = read('/proc/mounts');
	if (!mounts) return [];

	const btrfs = btrfsFilesystems();
	// Several mount points can share one filesystem (BTRFS subvolumes, bind mounts); they are one volume.
	const byFilesystem = new Map<string, StorageVolume>();

	for (const line of mounts.split('\n')) {
		const [source, rawMountPoint, filesystem] = line.split(' ');
		if (!source?.startsWith('/dev/')) continue;

		// /proc/mounts octal-escapes characters that would otherwise break the field separators.
		const mountPoint = rawMountPoint.replace(/\\(\d{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)));

		let dev: string;
		try {
			// The source may be a symlink, e.g. /dev/mapper/foo -> /dev/dm-0.
			dev = fs.realpathSync(source).slice('/dev/'.length);
		} catch {
			continue;
		}

		const btrfsInfo = btrfs.get(dev);

		const existing = byFilesystem.get(btrfsInfo?.fsid ?? dev);
		if (existing) {
			if (!existing.mountPoints.includes(mountPoint)) existing.mountPoints.push(mountPoint);
			continue;
		}

		let stat: fs.StatsFsBase<bigint>;
		try {
			stat = fs.statfsSync(mountPoint, { bigint: true });
		} catch {
			continue;
		}

		// BTRFS tracks its own members; anything else spanning devices does so through MD or device-mapper.
		const devices = new Set<string>();
		for (const member of btrfsInfo?.devices ?? [dev]) physicalDisks(member, devices);
		if (!devices.size) continue;

		byFilesystem.set(btrfsInfo?.fsid ?? dev, {
			mountPoints: [mountPoint],
			filesystem,
			devices: [...devices].sort((a, b) => a.localeCompare(b)),
			profile: btrfsInfo?.profile ?? read(`/sys/block/${dev}/md/level`),
			total: stat.blocks * stat.bsize,
			used: (stat.blocks - stat.bfree) * stat.bsize,
		});
	}

	return [...byFilesystem.values()].sort((a, b) => a.mountPoints[0].localeCompare(b.mountPoints[0]));
}

function storage(): Storage {
	return { devices: devices(), volumes: volumes() };
}

type DmiMemory = Pick<Memory, 'speed' | 'formFactor' | 'type'>;

let dmiMemory: DmiMemory | undefined;

/** Static memory hardware details from DMI. */
function memoryHardware(): DmiMemory {
	if (dmiMemory) return dmiMemory;
	dmiMemory = { speed: 0 };

	try {
		const dmiMemoryInfo = execFileSync('sudo', ['-n', 'dmidecode', '-t', '17'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		for (const match of dmiMemoryInfo.matchAll(/^\s*(?:Configured Memory|Configured Clock)?\s*Speed:\s*(\d+)\s*MT\/s/gim)) {
			dmiMemory.speed = Math.max(dmiMemory.speed, Number(match[1]));
		}
		const populated = (field: string): string | undefined => {
			for (const [, match] of dmiMemoryInfo.matchAll(new RegExp(`^[ \\t]*${field}:[ \\t]*(.+)$`, 'gim'))) {
				const value = match.trim();
				if (value && value !== 'Unknown') return value;
			}
		};
		dmiMemory.formFactor = populated('Form Factor');
		dmiMemory.type = populated('Type');
	} catch {
		// dmidecode missing, not root, or sudo needs a password
	}

	return dmiMemory;
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
		...memoryHardware(),
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
