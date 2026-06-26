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
	/** Only available when swap is in use */
	swap: TotalUsed.optional(),
});
export interface Memory extends z.infer<typeof Memory> {}

export const Storage = z.object({
	...TotalUsed.shape,
	model: z.string(),
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
	storage: Storage.array(),
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
