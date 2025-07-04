import type { RequestMethod } from '@axium/core/requests';
import { config, loadDefaultConfigs } from '@axium/server/config';
import { clean, database } from '@axium/server/database';
import { dirs, logger } from '@axium/server/io';
import { resolveRoute, routes, type ServerRoute } from '@axium/server/routes';
import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { error, isHttpError, json, redirect } from '@sveltejs/kit';
import { allLogLevels } from 'logzen';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path/posix';
import { render } from 'svelte/server';
import z from 'zod/v4';
import { options } from '../.svelte-kit/generated/server/internal.js';
import '@axium/server/api/index';

logger.attach(createWriteStream(join(dirs.at(-1), 'server.log')), { output: allLogLevels });
await loadDefaultConfigs();
await clean({});

process.on('beforeExit', async () => {
	await database.destroy();
});

async function apiHandler(event: RequestEvent, route: ServerRoute): Promise<Response> {
	const { method } = event.request;

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

function failure(e: Error) {
	console.error(e);
	return json({ message: 'Internal Error' + (config.debug ? ': ' + e.message : '') }, { status: 500 });
}

function handleError(e: Error) {
	if (!isHttpError(e)) return failure(e);
	console.error(e);
	return json(e.body, { status: e.status });
}

export async function handle({
	event,
	resolve,
}: {
	event: RequestEvent;
	resolve: (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;
}) {
	const route = resolveRoute(event);

	if (!route && event.url.pathname === '/') redirect(303, '/_axium/default');

	if (config.debug) console.log(event.request.method.padEnd(7), route ? route.path : event.url.pathname);

	if (!route) return await resolve(event).catch(handleError);

	if (route.server == true) {
		if (route.api) return await apiHandler(event, route).catch(handleError);

		try {
			const result = await route[event.request.method as RequestMethod](event);
			if (result instanceof Response) return result;
			return json(result);
		} catch (e) {
			return failure(e);
		}
	}

	const data = await route.load(event);

	const { head, body } = render(route.page);
	options.template.app({ head, body, assets: config.web.assets });
}
