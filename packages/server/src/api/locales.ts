import * as locales from '@james-pre/locales';
import * as z from 'zod';
import config from '../config.js';
import { error, json } from '../requests.js';
import { addRoute } from '../routes.js';

addRoute({
	path: '/locales/:language',
	params: { language: z.string().max(35) },
	GET(request, { language }) {
		const requested = language.endsWith('.json') ? language.slice(0, -5) : language;

		const resolved = locales.resolve(requested);
		if (!resolved) error(404, 'No translations available for ' + requested);

		return json(locales.loaded[resolved], {
			headers: {
				'Content-Language': resolved,
				'Cache-Control': config.web.disable_cache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=300',
			},
		});
	},
});
