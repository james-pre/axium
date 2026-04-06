import { registry as zodRegistry } from 'zod/v4/core';

export interface ZodLocaleInfo {
	/**
	 * Translation key for this schema
	 */
	key?: string;
	/**
	 * Key prefix for objects, enums, and literal collections. Intended for use with `ZodInput` for easier usage.
	 * @example
	 * ```ts
	 * const Duck = z.object({
	 * 	name: z.string(),
	 * 	type: z.literal(['mallard', 'gadwall', 'pintail']).register(zKeys, { key: 'duck.type', prefix: 'duck_type' }),
	 * }).register(zKeys, { key: 'animals.duck', prefix: 'duck' });
	 *
	 * text('duck.name'); // 'Duck Name'
	 * text('duck_type.mallard') // 'Mallard'
	 * ```
	 */
	prefix?: string;
}

/**
 * Zod registry for attaching translation keys to schemas
 */
export const zKeys = zodRegistry<ZodLocaleInfo>();
