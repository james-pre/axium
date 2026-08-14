import { loadedLocales } from '@axium/core/locales';
import * as z from 'zod';
import config from '../config.js';
import { error, json } from '../requests.js';
import { addRoute } from '../routes.js';

/**
 * Pick the best locale we have for a language tag, e.g. `en-US` falls back to `en`.
 */
function resolveLocale(requested: string): string | undefined {
	const available = Object.keys(loadedLocales);
	if (available.includes(requested)) return requested;

	for (let tag = requested; tag.includes('-'); ) {
		tag = tag.slice(0, tag.lastIndexOf('-'));
		if (available.includes(tag)) return tag;
	}
}

addRoute({
	path: '/locales/:language',
	params: { language: z.string().max(35) },
	GET(request, { language }) {
		const requested = language.endsWith('.json') ? language.slice(0, -5) : language;

		const resolved = resolveLocale(requested);
		if (!resolved) error(404, 'No translations available for ' + requested);

		return json(loadedLocales[resolved], {
			headers: {
				'Content-Language': resolved,
				'Cache-Control': config.web.disable_cache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=300',
			},
		});
	},
});
