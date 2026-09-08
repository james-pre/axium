import type { UserInfo } from 'node:os';
import * as z from 'zod';

export const TotalUsed = z.object({
	total: z.coerce.bigint(),
	used: z.coerce.bigint(),
});
export interface TotalUsed extends z.infer<typeof TotalUsed> {}

// Hardware + kernel //

export const CPU = z.object({
	model: z.string(),
	cores: z.number(),
});
export interface CPU extends z.infer<typeof CPU> {}

export const GPU = z.object({
	model: z.string(),
	/** Video memory in bytes; only available for some drivers (e.g. amdgpu) */
	vram: TotalUsed.optional(),
});
export interface GPU extends z.infer<typeof GPU> {}

export const Memory = z.object({
	...TotalUsed.shape,
	/** Memory speed in MT/s */
	speed: z.int().nonnegative(),
	/** Form factor, e.g. 'DIMM' or 'SODIMM' */
	formFactor: z.string().optional(),
	/** Memory type, e.g. 'DDR4' or 'DDR5' */
	type: z.string().optional(),
	/** Only available when swap is in use */
	swap: TotalUsed.optional(),
});
export interface Memory extends z.infer<typeof Memory> {}

export const StorageDevice = z.object({
	/** Kernel name of the block device, e.g. 'nvme0n1' or 'sda' */
	name: z.string(),
	model: z.string(),
	/** Capacity in bytes */
	size: z.coerce.bigint(),
	/** How the device is attached, e.g. 'PCIe 4.0 x4' or 'SATA 6.0 Gbps' */
	interface: z.string().optional(),
	/** Whether the device is a spinning disk rather than solid state */
	rotational: z.boolean(),
	/** Whether the device's media can be removed, e.g. a card reader or optical drive */
	removable: z.boolean(),
});
export interface StorageDevice extends z.infer<typeof StorageDevice> {}

export const StorageVolume = z.object({
	...TotalUsed.shape,
	/** Every mount point of the filesystem; more than one for e.g. BTRFS subvolumes or bind mounts */
	mountPoints: z.string().array(),
	/** Filesystem type, e.g. 'btrfs' or 'ext4' */
	filesystem: z.string(),
	/** Names of the devices backing this volume, matching `StorageDevice.name` */
	devices: z.string().array(),
	/**
	 * The RAID or allocation profile the volume is stored with, e.g. 'raid1'.
	 * Only known for filesystems that manage their own devices (BTRFS) and MD arrays; unset when it is plain 'single'.
	 */
	profile: z.string().optional(),
});
export interface StorageVolume extends z.infer<typeof StorageVolume> {}

export const Storage = z.object({
	/** Physical devices, including ones not backing any volume */
	devices: StorageDevice.array(),
	/** Mounted filesystems, each of which may span several devices */
	volumes: StorageVolume.array(),
});
export interface Storage extends z.infer<typeof Storage> {}

export const NetworkInterface = z.object({
	name: z.string(),
	model: z.string(),
	connected: z.boolean(),
	wireless: z.boolean(),
	connection: z.string().optional(),
	speed: z.number().nonnegative().optional(),
});
export interface NetworkInterface extends z.infer<typeof NetworkInterface> {}

export const SystemInfoUser = z.object({
	username: z.string(),
	uid: z.int(),
	gid: z.int(),
	shell: z.string().nullable(),
	homedir: z.string(),
});
export interface SystemInfoUser extends z.infer<typeof SystemInfoUser>, UserInfo<string> {}

export const SystemInfo = z.object({
	cpus: CPU.array(),
	gpus: GPU.array(),
	memory: Memory,
	storage: Storage,
	networkInterfaces: NetworkInterface.array(),
	/** e.g. 'arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc64', 'riscv64', 's390x', and 'x64' */
	arch: z.string(),
	/** e.g. arm, arm64, aarch64, mips, mips64, ppc64, ppc64le, s390x, i386, i686, x86_64 */
	machine: z.string(),
	/** e.g. 'aix', 'darwin', 'freebsd','linux', 'openbsd', 'sunos', and 'win32' */
	platform: z.string(),
	/** OS/kernel release, e.g. 6.7.0-200.fc40.x86_64 */
	release: z.string(),
	/** e.g. 'Linux' on Linux, 'Darwin' on macOS, and 'Windows_NT' */
	type: z.string(),
	/** Uptime in seconds */
	uptime: z.number(),
	/** Kernel version, e.g. `#1 SMP PREEMPT_DYNAMIC ...` */
	version: z.string(),
	hostname: z.string(),
	user: SystemInfoUser,
});
export interface SystemInfo extends z.infer<typeof SystemInfo> {}

// OS //

// User //
