import { extendLocale, loadedLocales, type LocaleData, type LocaleKey, type LocaleKeys, type LocaleValue } from '@axium/core/locales';
import { error, warn } from 'ioium';
import en from '../locales/en.json' with { type: 'json' };
import { getByString } from 'utilium';

extendLocale('en', en);

let currentLoaded: LocaleData;

/**
 * Current locale
 */
export let currentLocale = 'en';

let currentRegionNames: Intl.DisplayNames;
export function countryName(code: string): string | undefined {
	return currentRegionNames.of(code);
}

let currentDateFields: Intl.DisplayNames;
export function dateField(name: string): string | undefined {
	return currentDateFields.of(name);
}

let currentConjunction: Intl.ListFormat;
export function conjoin(list: Iterable<string>) {
	return currentConjunction.format(list);
}

let currentDisjunction: Intl.ListFormat;
export function disjoin(list: Iterable<string>) {
	return currentDisjunction.format(list);
}

export let currentMonthNames: string[];

export interface ReplacementOptions {
	$default?: string;
	/** Whether to treat the replacement as HTML */
	$html?: boolean;
}

type Replacements<K extends string> = ReplacementOptions & (K extends LocaleKey ? LocaleKeys[K & LocaleKey] : Record<string, LocaleValue>);

type ReplacementsArgs<K extends string> = {} extends Replacements<K> ? [replacements?: Replacements<K>] : [replacements: Replacements<K>];

export function useLocale(newLocale: string): void {
	if (!loadedLocales[newLocale]) throw new Error('Locale is not available: ' + newLocale);
	currentLocale = newLocale;
	currentLoaded = loadedLocales[newLocale];
	currentRegionNames = new Intl.DisplayNames(newLocale, { type: 'region' });
	currentDateFields = new Intl.DisplayNames(newLocale, { type: 'dateTimeField' });
	currentConjunction = new Intl.ListFormat(newLocale, { style: 'long', type: 'conjunction' });
	currentDisjunction = new Intl.ListFormat(newLocale, { style: 'long', type: 'disjunction' });

	const formatter = new Intl.DateTimeFormat(newLocale, { month: 'long' });
	currentMonthNames = Array.from({ length: 12 }, (_, monthIndex) => formatter.format(new Date(Date.UTC(2000, monthIndex + 1, 1))));
}

useLocale('en');

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
export function text<const K extends string = LocaleKey>(key: K, ...args: ReplacementsArgs<K>): string {
	const values: Record<string, any> & ReplacementOptions = Object.assign(Object.create(null), args[0]);

	let text: string | object | undefined = getByString(currentLoaded, key) || values.$default;

	if (!text && currentLocale != 'en') {
		warn(`Missing translation in ${currentLocale}: ` + key);
		text = getByString(en, key);
	}

	if (!text) {
		error('Missing translation for key: ' + key);
		text = `?${key}?`;
	}

	if (typeof text == 'object') {
		error('Invalid translation key: ' + key);
		text = values.$default || `!${key}!`;
	}

	return text.replaceAll(localeReplacement, (_, name) => {
		if (!Object.hasOwn(values, name)) {
			console.error(new Error(`Missing replacement value for ${key}: ${name}`));
			values[name] = `<missing: ${name}>`;
		}
		return values.$html ? escape(String(values[name])) : String(values[name]);
	});
}
