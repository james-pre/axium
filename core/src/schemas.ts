import * as z from 'zod';

/**
 * Can narrow using `.def.format`
 */
export type ZodSpecificStringFormat =
	| z.ZodGUID
	| z.ZodUUID
	| z.ZodEmail
	| z.ZodURL
	| z.ZodEmoji
	| z.ZodNanoID
	| z.ZodCUID
	| z.ZodCUID2
	| z.ZodULID
	| z.ZodXID
	| z.ZodKSUID
	| z.ZodIPv4
	| z.ZodIPv6
	| z.ZodCIDRv4
	| z.ZodCIDRv6
	| z.ZodBase64
	| z.ZodBase64URL
	| z.ZodE164
	| z.ZodJWT
	| z.ZodCustomStringFormat<'hostname' | 'hex' | `${z.util.HashAlgorithm}_${z.util.HashEncoding}`>;

export function zIsFormat<F extends string, S extends ZodSpecificStringFormat>(x: S, format: F): x is S & z.ZodStringFormat<F> {
	return x.def.format === format;
}

/**
 * Used to narrow using `type` and get access to type-specific properties (e.g. `ZodNumber.minValue`)
 */
export type ZodSerializable =
	| ZodSpecificStringFormat
	// generic primitives
	| z.ZodString
	| z.ZodNumber
	| z.ZodBigInt
	| z.ZodBoolean
	| z.ZodDate
	| z.ZodLiteral
	| z.ZodTemplateLiteral
	| z.ZodFile
	| z.ZodEnum
	// collections
	| z.ZodRecord<z.ZodString, any>
	| z.ZodTuple<any[]>
	// wrappers
	| z.ZodNullable<any>
	| z.ZodOptional<any>
	| z.ZodNonOptional<any>
	| z.ZodPrefault<any>
	| z.ZodDefault<any>
	| z.ZodReadonly<any>
	| z.ZodSuccess<any>
	// composites
	| z.ZodArray<any>
	| z.ZodObject<Readonly<Record<string, any>>>
	// misc
	| z.ZodIntersection<any, any>
	| z.ZodUnion<any[]>
	| z.ZodTransform
	| z.ZodPipe<any, any>;

/**
 * Used to narrow using `type` and get access to type-specific properties (e.g. `ZodNumber.minValue`)
 */
export type ZodSpecificType =
	| ZodSerializable
	// primitives
	| z.ZodSymbol
	| z.ZodNull
	| z.ZodUndefined
	| z.ZodVoid
	| z.ZodNever
	| z.ZodAny
	| z.ZodUnknown
	| z.ZodNaN
	// collections
	| z.ZodRecord<z.ZodString, ZodSpecificType>
	| z.ZodTuple<ZodSpecificType[]>
	| z.ZodMap<ZodSpecificType, ZodSpecificType>
	| z.ZodSet<ZodSpecificType>
	// wrappers
	| z.ZodCatch<any>
	// misc
	| z.ZodPromise<ZodSpecificType>
	| z.ZodLazy<any>
	| z.ZodFunction<any, ZodSpecificType>
	| z.ZodCustom;

export function zFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implement']>[0]>((fn: any) => schema.implement(fn));
}

export function zAsyncFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implementAsync']>[0]>((fn: any) => schema.implementAsync(fn));
}
