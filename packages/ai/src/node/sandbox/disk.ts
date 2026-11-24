import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';

function tool(name: string): string {
	return ['/usr/sbin/' + name, '/sbin/' + name].find(existsSync) ?? name;
}

function exec(command: string, args: string[]): Promise<number | null> {
	const { promise, resolve, reject } = Promise.withResolvers<number | null>();
	const child = spawn(tool(command), args, { stdio: 'ignore' });
	child.once('error', reject);
	child.once('close', resolve);
	return promise;
}

export interface CreateOptions {
	/** The user and group that own the file system's root directory */
	owner?: number;
	/** Disks only written while building can do without a journal */
	journal?: boolean;
}

/**
 * Creates a sparse ext4 image, which only takes space as it fills
 * @param size In bytes
 */
export async function create(path: string, size: number, { owner, journal = true }: CreateOptions = {}): Promise<void> {
	const partial = path + '.partial';
	const file = await open(partial, 'w', 0o600);
	await file.truncate(size);
	await file.close();

	const code = await exec('mkfs.ext4', [
		'-q',
		'-F',
		'-m',
		'0',
		...(journal ? [] : ['-O', '^has_journal']),
		...(owner === undefined ? [] : ['-E', `root_owner=${owner}:${owner}`]),
		partial,
	]);
	if (code !== 0) {
		await rm(partial, { force: true });
		throw new Error('Could not create a disk for the sandbox');
	}

	await rename(partial, path);
}

/** Checks and repairs an ext4 image, e.g. after a VM wrote to it without unmounting */
export async function repair(path: string): Promise<void> {
	const code = await exec('e2fsck', ['-f', '-y', path]);
	if (code === null || code >= 4) throw new Error(`The sandbox's disk has errors e2fsck could not fix (exit code ${code})`);
}
