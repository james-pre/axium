/**
 * Turns this process into a libkrun microVM, which exits with the guest command's exit code.
 * Runs inside the jail made by `vm.ts`, so it may only import Node's own modules.
 * Usage: `node launch.js <spec.json>`, or `node launch.js --check` to only load libkrun.
 * @module
 */
import { dlopen, getRawPointer } from 'node:ffi';
import { readFileSync } from 'node:fs';

/** What `vm.ts` asks for */
export interface Spec {
	/** A directory shared as the root filesystem, or a raw ext4 image used as the first disk */
	root: { directory: string } | { disk: string };
	writableRoot: boolean;
	/** Raw disk images added after the root, in order */
	disks: { path: string; writable: boolean }[];
	/** Directories the guest can mount with `mount -t virtiofs <tag>` */
	shares: Record<string, { path: string; writable: boolean }>;
	/** In MiB */
	memory: number;
	cpus: number;
	/** A Unix socket guests reach at a vsock port */
	proxy?: { path: string; port: number };
	/** The guest program and its arguments, which must be printable ASCII */
	exec: string[];
	/** `NAME=value`, printable ASCII */
	env: string[];
}

const { functions: krun } = dlopen('libkrun.so.1', {
	krun_set_log_level: { arguments: ['uint32'], return: 'int32' },
	krun_create_ctx: { return: 'int32' },
	krun_set_vm_config: { arguments: ['uint32', 'uint8', 'uint32'], return: 'int32' },
	krun_add_virtiofs3: { arguments: ['uint32', 'string', 'string', 'uint64', 'bool'], return: 'int32' },
	krun_add_disk: { arguments: ['uint32', 'string', 'string', 'bool'], return: 'int32' },
	krun_set_root_disk_remount: { arguments: ['uint32', 'string', 'string', 'string'], return: 'int32' },
	krun_disable_implicit_vsock: { arguments: ['uint32'], return: 'int32' },
	krun_add_vsock: { arguments: ['uint32', 'uint32'], return: 'int32' },
	krun_add_vsock_port: { arguments: ['uint32', 'uint32', 'string'], return: 'int32' },
	krun_disable_implicit_console: { arguments: ['uint32'], return: 'int32' },
	krun_add_virtio_console_default: { arguments: ['uint32', 'int32', 'int32', 'int32'], return: 'int32' },
	krun_set_workdir: { arguments: ['uint32', 'string'], return: 'int32' },
	krun_set_exec: { arguments: ['uint32', 'string', 'buffer', 'buffer'], return: 'int32' },
	krun_start_enter: { arguments: ['uint32'], return: 'int32' },
});

if (process.argv[2] == '--check') process.exit(0);

const spec: Spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));

/** libkrun keeps pointers to these until the VM ends, which is when this process exits */
const kept: Buffer[] = [];

function check(result: number, action: string): number {
	if (result >= 0) return result;
	process.stderr.write(`Sandbox: could not ${action} (errno ${-result})\n`);
	process.exit(125);
}

/** A NULL-terminated `char *[]` */
function strings(values: string[]): BigUint64Array {
	const array = new BigUint64Array(values.length + 1);
	for (const [index, value] of values.entries()) {
		const buffer = Buffer.from(value + '\0');
		kept.push(buffer);
		array[index] = getRawPointer(buffer);
	}
	return array;
}

krun.krun_set_log_level(0);
const context = check(krun.krun_create_ctx(), 'create the VM');
check(krun.krun_set_vm_config(context, spec.cpus, spec.memory), 'configure the VM');

if ('directory' in spec.root) {
	check(krun.krun_add_virtiofs3(context, '/dev/root', spec.root.directory, 0n, spec.writableRoot ? 0 : 1), 'add the root filesystem');
} else {
	check(krun.krun_add_disk(context, 'root', spec.root.disk, spec.writableRoot ? 0 : 1), 'add the root disk');
	check(krun.krun_set_root_disk_remount(context, '/dev/vda', 'ext4', spec.writableRoot ? 'rw' : 'ro'), 'use the root disk');
}

for (const [index, disk] of spec.disks.entries()) {
	check(krun.krun_add_disk(context, 'disk' + index, disk.path, disk.writable ? 0 : 1), 'add a disk');
}

for (const [tag, share] of Object.entries(spec.shares)) {
	check(krun.krun_add_virtiofs3(context, tag, share.path, 0n, share.writable ? 0 : 1), 'share ' + tag);
}

check(krun.krun_disable_implicit_vsock(context), 'configure vsock');
if (spec.proxy) {
	check(krun.krun_add_vsock(context, 0), 'add vsock');
	check(krun.krun_add_vsock_port(context, spec.proxy.port, spec.proxy.path), 'connect the proxy');
}

check(krun.krun_disable_implicit_console(context), 'configure the console');
check(krun.krun_add_virtio_console_default(context, 0, 1, 2), 'add the console');
check(krun.krun_set_workdir(context, '/'), 'set the working directory');
check(krun.krun_set_exec(context, spec.exec[0], strings(spec.exec.slice(1)), strings(spec.env)), 'set the command');
check(krun.krun_start_enter(context), 'start the VM');
