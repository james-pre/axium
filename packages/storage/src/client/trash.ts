import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const trashDirectory = join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'Trash');

export function hasTrash(): boolean {
	return fs.existsSync(trashDirectory);
}

function deletionDate(): string {
	const now = new Date();
	const pad = (value: number) => value.toString().padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** Moves a file into the trash, or copies it there when `keep` is set. */
export function moveToTrash(path: string, keep: boolean = false): void {
	const files = join(trashDirectory, 'files'),
		info = join(trashDirectory, 'info');

	fs.mkdirSync(files, { recursive: true });
	fs.mkdirSync(info, { recursive: true });

	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	const contents = `[Trash Info]\nPath=${encodedPath}\nDeletionDate=${deletionDate()}\n`;

	for (let i = 1; ; i++) {
		const name = i == 1 ? basename(path) : `${basename(path)}.${i}`;
		const infoPath = join(info, name + '.trashinfo'),
			target = join(files, name);

		if (fs.existsSync(target)) continue;

		try {
			fs.writeFileSync(infoPath, contents, { flag: 'wx' });
		} catch (e: any) {
			if (e.code == 'EEXIST') continue;
			throw e;
		}

		try {
			if (keep) fs.linkSync(path, target);
			else fs.renameSync(path, target);
			return;
		} catch (e: any) {
			if (e.code != 'EXDEV') {
				fs.rmSync(infoPath, { force: true });
				throw e;
			}
		}

		fs.cpSync(path, target, { preserveTimestamps: true });
		if (!keep) fs.rmSync(path);
		return;
	}
}
