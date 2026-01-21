import * as z from 'zod';

export const PackageVersionInfo = z.object({
	name: z.string(),
	version: z.string(),
	latest: z.string().nullable(),
});

export interface PackageVersionInfo extends z.infer<typeof PackageVersionInfo> {}
