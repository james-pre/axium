import { deepAssign } from 'utilium';
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

/**
 * Translation data for a single locale. Keys can be nested, leaves are the translations themselves.
 */
export interface LocaleData {
	[key: string]: string | readonly string[] | LocaleData;
}

/** The types allowed for a replacement's value */
export type LocaleValue = string | number | bigint | boolean;

/** Maps every known translation key to the replacements it needs. */
export interface LocaleKeys {}

/** A translation key that is known at compile time */
export type LocaleKey = keyof LocaleKeys & string;

export const loadedLocales: Record<string, LocaleData> = Object.create(null);

/** Add translations to a locale. */
export function extendLocale(locale: string, data: object): void {
	loadedLocales[locale] ||= {};
	deepAssign(loadedLocales[locale], data);
}
