import * as z from 'zod';

export const UploadSize = z.coerce.bigint().nonnegative();
export const UploadName = z.string().nonempty().max(255);

export const UploadInit = z.object({
	name: UploadName,
	size: UploadSize,
	type: z.string(),
	hash: z.hex().nullish(),
});
export interface UploadInit extends z.infer<typeof UploadInit> {}

export const UploadConfig = z.object({
	/** Where to put in-progress chunked uploads */
	temp_dir: z.string(),
	/** How many minutes before an in-progress upload times out */
	timeout: z.number(),
});
export interface UploadConfig extends z.infer<typeof UploadConfig> {}
