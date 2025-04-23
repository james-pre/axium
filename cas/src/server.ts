import type {} from '@axium/server/config.js';
import type {} from '@axium/server/database.js';
import { database } from '@axium/server/database.js';
import type { Generated } from 'kysely';
import { createHash } from 'node:crypto';
import type { FileMetadata } from './common.js';

export interface DBContentAddressableFile {
	fileId: Generated<string>;
	ownerId: string;
	lastModified: Generated<Date>;
	restricted: Generated<boolean>;
	size: Generated<number>;
	trashedAt: Date | null;
	hash: Uint8Array;
}

declare module '@axium/server/database.js' {
	export interface Schema {
		ContentAddressableFile: DBContentAddressableFile;
	}
}

export interface FilesConfig {
	/** Path to data directory */
	data: string;
}

declare module '@axium/server/config.js' {
	export interface Config {
		files: FilesConfig;
	}
}

export async function currentUsage(userId: string): Promise<number> {
	const result = await database
		.selectFrom('ContentAddressableFile')
		.where('ownerId', '=', userId)
		.select(eb => eb.fn.sum('size').as('size'))
		.executeTakeFirst();

	return Number(result?.size);
}

export async function fileMetadata(fileId: string): Promise<FileMetadata | undefined> {
	return await database.selectFrom('ContentAddressableFile').where('fileId', '=', fileId).selectAll().executeTakeFirst();
}

export async function addFile(ownerId: string, file: File): Promise<void> {
	const content = new Uint8Array(await file.arrayBuffer());

	const hash = createHash('BLAKE2b512').update(content).digest();

	await database.insertInto('ContentAddressableFile').values({ ownerId, hash }).execute();
}
