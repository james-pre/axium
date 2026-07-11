import * as z from 'zod';

export const bool = z.union([z.stringbool(), z.boolean()]);
export const port = z.coerce.number().int().min(1).max(65535);
