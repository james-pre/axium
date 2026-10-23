import * as locales from '@james-pre/locales';
import { debug, warn } from 'ioium';
import { origin } from '../requests.js';

/**
 * Fetch the translations the server has for a language and start using them.
 * The server resolves the language, so for example asking for `en-US` may give you `en`.
 * @returns the locale that is now in use
 */
export async function loadLocale(language: string = globalThis.navigator?.language || locales.current): Promise<string> {
	const response = await fetch(new URL('/locales/' + encodeURIComponent(language), origin));

	if (!response.ok) {
		warn(
			`No translations for ${language}:`,
			response.headers.get('content-type') == 'application/json' ? (await response.json()).message : response.statusText
		);
		return locales.current;
	}

	const resolved = response.headers.get('Content-Language') || language;

	locales.extend(resolved, await response.json());
	locales.use(resolved);

	debug('Using locale: ' + resolved);
	return resolved;
}
