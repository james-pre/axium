import type { FlattenKeys, GetByString, Split, UnionToIntersection } from 'utilium';
import { getByString } from 'utilium';
import en from '../locales/en.json' with { type: 'json' };

const loadedLocales = Object.assign(Object.create(null), { en });

let currentLoaded = en;

/**
 * Current locale
 */
export let currentLocale = 'en';

type _locale = typeof currentLoaded;

export interface Locale extends _locale {}

type _ArgsValue<V extends string[]> = UnionToIntersection<
	{
		[I in keyof V]: Split<V[I], '}'> extends [infer Name extends string, string] ? { [N in Name]: string } : {};
	}[keyof V & number]
>;

type Args<K extends string> = _ArgsValue<Split<GetByString<Locale, K> & string, '{'>>;

export function useLocale(newLocale: string): void {
	if (!loadedLocales[newLocale]) throw new Error('Locale is not available: ' + newLocale);
	currentLocale = newLocale;
	currentLoaded = loadedLocales[newLocale];
}

const localeReplacement = /\{(\w+)\}/g;

/**
 * Get localized text for a given translation key
 * @example
 * ```ts
 * text(`example.translation.key.${dynamicPart}`, { a: 1, b: 2 });
 * ```
 */
export function text<const K extends string = FlattenKeys<Locale>>(
	key: K,
	replacements: GetByString<Locale, K> extends string ? Args<K> : Record<string, any>
): string {
	const text = String(getByString(currentLoaded, key));
	const replaceValues = Object.assign(Object.create(null), replacements);
	return text.replaceAll(localeReplacement, (_, name) => {
		if (!Object.hasOwn(replaceValues, name)) {
			console.error(new Error(`Missing replacement value for ${key}: ${name}`));
			replaceValues[name] = `<missing: ${name}>`;
		}
		return String(replaceValues[name]);
	});
}
