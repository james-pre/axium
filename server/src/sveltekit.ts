import type { RequestMethod } from '@axium/core/requests';
import type { HttpError, Redirect, RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { styleText } from 'node:util';
import { render } from 'svelte/server';
import z from 'zod';
import { config } from './config.js';
import { resolveRoute, type ServerRoute } from './routes.js';

async function handleAPIRequest(event: RequestEvent, route: ServerRoute): Promise<Response> {
	const method = event.request.method as RequestMethod;

	const _warnings: string[] = [];
	if (route.api && !event.request.headers.get('Accept')?.includes('application/json')) {
		_warnings.push('Only application/json is supported');
		event.request.headers.set('Accept', 'application/json');
	}

	for (const [key, type] of Object.entries(route.params || {})) {
		if (!type) continue;

		try {
			event.params[key] = type.parse(event.params[key]) as any;
		} catch (e: any) {
			error(400, `Invalid parameter: ${z.prettifyError(e)}`);
		}
	}

	if (typeof route[method] != 'function') error(405, `Method ${method} not allowed for ${route.path}`);

	const result: (object & { _warnings?: string[] }) | Response = await route[method](event);

	if (result instanceof Response) return result;

	result._warnings ||= [];
	result._warnings.push(..._warnings);

	return json(result);
}

function handleError(e: Error | HttpError | Redirect) {
	if ('body' in e) return json(e.body, { status: e.status });
	if ('location' in e) return Response.redirect(e.location, e.status);
	console.error(e);
	return json({ message: 'Internal Error' + (config.debug ? ': ' + e.message : '') }, { status: 500 });
}

let template = null;

function fillTemplate({ head, body }: Record<'head' | 'body', string>, env: Record<string, string> = {}, nonce: string = ''): string {
	template ||= readFileSync(config.web.template, 'utf-8');
	return (
		template
			.replace('%sveltekit.head%', head)
			.replace('%sveltekit.body%', body)
			.replace(/%sveltekit\.assets%/g, config.web.assets)
			// Unused for now.
			.replace(/%sveltekit\.nonce%/g, nonce)
			.replace(/%sveltekit\.env\.([^%]+)%/g, (_match: string[], key: string) => env[key] ?? '')
	);
}

/**
 * @internal
 */
export async function handle({
	event,
	resolve,
}: {
	event: RequestEvent;
	resolve: (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;
}) {
	const route = resolveRoute(event);

	if (!route && event.url.pathname === '/' && config.debug)
		return new Response(null, { status: 303, headers: { Location: '/_axium/default' } });

	if (config.debug) console.log(styleText('blueBright', event.request.method.padEnd(7)), route ? route.path : event.url.pathname);

	if (!route) return await resolve(event).catch(handleError);

	if (route.server == true) {
		if (route.api) return await handleAPIRequest(event, route).catch(handleError);

		const run = route[event.request.method as RequestMethod];
		if (typeof run !== 'function') {
			error(405, `Method ${event.request.method} not allowed for ${route.path}`);
		}
		try {
			const result = await run(event);
			if (result instanceof Response) return result;
			return json(result);
		} catch (e: any) {
			return handleError(e);
		}
	}

	const data = await route.load?.(event);

	const body = fillTemplate(render(route.page));

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
