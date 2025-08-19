import * as z from 'zod';

/** Needed for discriminated union type narrowing */
export function zIs<const T extends z.core.$ZodTypeDef['type']>(schema: z.ZodType, type: T): schema is z.ZodType & { type: T } {
	return schema.def.type == type;
}

export function zFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implement']>[0]>((fn: any) => schema.implement(fn));
}

export function zAsyncFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implementAsync']>[0]>((fn: any) => schema.implementAsync(fn));
}
