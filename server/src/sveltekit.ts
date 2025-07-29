import type { RequestMethod } from '@axium/core/requests';
import { readFileSync } from 'node:fs';
import { styleText } from 'node:util';
import { render } from 'svelte/server';
import { config } from './config.js';
import { error, handleAPIRequest, handleResponseError, json, type RequestEvent } from './requests.js';
import { resolveRoute } from './routes.js';

let template: string | null = null;

function fillSvelteKitTemplate(
	{ head, body }: Record<'head' | 'body', string>,
	env: Record<string, string> = {},
	nonce: string = ''
): string {
	template ||= readFileSync(config.web.template, 'utf-8');
	return (
		template
			.replaceAll('%sveltekit.head%', head)
			.replaceAll('%sveltekit.body%', body)
			.replaceAll('%sveltekit.assets%', config.web.assets)
			// Unused for now.
			.replaceAll('%sveltekit.nonce%', nonce)
			.replace(/%sveltekit\.env\.([^%]+)%/g, (_match: string, key: string) => env[key] ?? '')
	);
}

/**
 * @internal
 */
export async function handleSvelteKit({
	event,
	resolve,
}: {
	event: RequestEvent;
	resolve: (event: RequestEvent, opts?: unknown) => Promise<Response>;
}) {
	const route = resolveRoute(event);

	if (!route && event.url.pathname === '/' && config.debug)
		return new Response(null, { status: 303, headers: { Location: '/_axium/default' } });

	if (config.debug) console.log(styleText('blueBright', event.request.method.padEnd(7)), route ? route.path : event.url.pathname);

	if (!route) return await resolve(event).catch(handleResponseError);

	if (route.server == true) {
		if (route.api) return await handleAPIRequest(event, route).catch(handleResponseError);

		const run = route[event.request.method as RequestMethod];
		if (typeof run !== 'function') {
			error(405, `Method ${event.request.method} not allowed for ${route.path}`);
		}
		try {
			const result = await run(event);
			if (result instanceof Response) return result;
			return json(result);
		} catch (e: any) {
			return handleResponseError(e);
		}
	}

	const data = await route.load?.(event);

	const body = fillSvelteKitTemplate(render(route.page));

	return new Response(body, {
		headers: config.web.disable_cache
			? {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					Pragma: 'no-cache',
					Expires: '0',
				}
			: {},
		status: 200,
	});
}
