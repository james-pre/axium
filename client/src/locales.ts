import { error, info, warn } from '@axium/core/io';
import type { FlattenKeys, GetByString, Split, UnionToIntersection } from 'utilium';
import { deepAssign, getByString } from 'utilium';
import en from '../locales/en.json' with { type: 'json' };

const loadedLocales = Object.assign(Object.create(null), { en });

/**
 * Add translations to a locale.
 * Note that translations are rendered as HTML, only replacements are escaped.
 */
export function extendLocale(locale: string, data: object) {
	if (!loadedLocales[locale]) {
		info('Adding new locale (no built-in): ' + locale);
		loadedLocales[locale] = {};
	}
	deepAssign(loadedLocales[locale], data);
}

let currentLoaded = en;

/**
 * Current locale
 */
export let currentLocale = 'en';

type _locale = typeof currentLoaded;

export interface Locale extends _locale {}

export interface ReplacementOptions {
	$default?: string;
	/**  */
	$html?: boolean;
}

type _ArgsValue<V extends string[]> = UnionToIntersection<
	{
		[I in keyof V]: Split<V[I], '}'> extends [infer Name extends string, string] ? { [N in Name]: string } : {};
	}[keyof V & number]
>;

type Replacements<K extends string> = ReplacementOptions &
	(GetByString<Locale, K> extends string ? _ArgsValue<Split<GetByString<Locale, K> & string, '{'>> : Record<string, any>);

type ReplacementsArgs<K extends string> = {} extends Replacements<K> ? [replacements?: Replacements<K>] : [replacements: Replacements<K>];

export function useLocale(newLocale: string): void {
	if (!loadedLocales[newLocale]) throw new Error('Locale is not available: ' + newLocale);
	currentLocale = newLocale;
	currentLoaded = loadedLocales[newLocale];
}

const localeReplacement = /\{(\w+)\}/g;

const escapePattern = /[&<>"']/g;

const escapes: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

export function escape(text: string) {
	return text.replaceAll(escapePattern, ch => escapes[ch]);
}

/**
 * Get localized text for a given translation key
 * @example
 * ```ts
 * text(`example.translation.key.${dynamicPart}`, { a: 1, b: 2 });
 * ```
 */
export function text<const K extends string = FlattenKeys<Locale>>(key: K, ...args: ReplacementsArgs<K>): string {
	const values: Record<string, any> & ReplacementOptions = Object.assign(Object.create(null), args[0]);

	let text: string | object | undefined = getByString(currentLoaded, key) || values.$default;

	if (!text && currentLocale != 'en') {
		warn(`Missing translation in ${currentLocale}: ` + key);
		text = getByString(en, key);
	}

	if (!text) {
		error('Missing translation for key: ' + key);
		text = `[missing translation ${key}]`;
	}

	if (typeof text == 'object') {
		error('Invalid translation key: ' + key);
		text = values.$default || `[invalid translation: ${key}]`;
	}

	return text.replaceAll(localeReplacement, (_, name) => {
		if (!Object.hasOwn(values, name)) {
			console.error(new Error(`Missing replacement value for ${key}: ${name}`));
			values[name] = `<missing: ${name}>`;
		}
		return values.$html ? escape(String(values[name])) : String(values[name]);
	});
}
