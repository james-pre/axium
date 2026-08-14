import { extendLocale } from '@axium/core/locales';
import { debug, warn } from 'ioium';
import { currentLocale, useLocale } from '../locales.js';
import { origin } from '../requests.js';

/**
 * Fetch the translations the server has for a language and start using them.
 * The server resolves the language, so for example asking for `en-US` may give you `en`.
 * @returns the locale that is now in use
 */
export async function loadLocale(language: string = globalThis.navigator?.language || currentLocale): Promise<string> {
	const response = await fetch(new URL('/locales/' + encodeURIComponent(language), origin));

	if (!response.ok) {
		warn(
			`No translations for ${language}:`,
			response.headers.get('content-type') == 'application/json' ? (await response.json()).message : response.statusText
		);
		return currentLocale;
	}

	const resolved = response.headers.get('Content-Language') || language;

	extendLocale(resolved, await response.json());
	useLocale(resolved);

	debug('Using locale: ' + resolved);
	return resolved;
}
