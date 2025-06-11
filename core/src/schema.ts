import z from 'zod/v4';

export function zFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implement']>[0]>((fn: any) => schema.implement(fn));
}

export function zAsyncFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implementAsync']>[0]>((fn: any) => schema.implementAsync(fn));
}
