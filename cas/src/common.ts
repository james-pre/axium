export interface ContentAddressableFile {
	fileId: string;
	ownerId: string;
	lastModified: Date;
	/** Whether editing the file is restricted to managers */
	restricted: boolean;
	size: number;
	trashedAt: Date | null;
	hash: Uint8Array;
}
