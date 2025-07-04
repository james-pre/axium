import type { RequestMethod } from '@axium/core/requests';
import '@axium/server/api/index';
import { config, loadDefaultConfigs } from '@axium/server/config';
import { clean, database } from '@axium/server/database';
import { dirs, logger } from '@axium/server/io';
import { resolveRoute, type ServerRoute } from '@axium/server/routes';
import type { AxiumRequest, HttpError } from '@axium/server/requests';
import { error, json, redirect } from '@axium/server/requests';
import { allLogLevels } from 'logzen';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path/posix';
import { render } from 'svelte/server';
import z from 'zod/v4';
import { options } from '../.svelte-kit/generated/server/internal.js';

logger.attach(createWriteStream(join(dirs.at(-1), 'server.log')), { output: allLogLevels });
await loadDefaultConfigs();
await clean({});

process.on('beforeExit', async () => {
	await database.destroy();
});

async function apiHandler(request: AxiumRequest, route: ServerRoute): Promise<Response> {
	const { method } = request;

	const _warnings: string[] = [];
	if (route.api && !request.raw.headers.get('Accept')?.includes('application/json')) {
		_warnings.push('Only application/json is supported');
		request.raw.headers.set('Accept', 'application/json');
	}

	for (const [key, type] of Object.entries(route.params || {})) {
		if (!type) continue;

		try {
			request.params[key] = type.parse(request.params[key]) as any;
		} catch (e: any) {
			error(400, `Invalid parameter: ${z.prettifyError(e)}`);
		}
	}

	if (typeof route[method] != 'function') error(405, `Method ${method} not allowed for ${route.path}`);

	const result: (object & { _warnings?: string[] }) | Response = await route[method](request);

	if (result instanceof Response) return result;

	result._warnings ||= [];
	result._warnings.push(..._warnings);

	return json(result);
}

function failure(e: Error) {
	console.error(e);
	return json({ message: 'Internal Error' + (config.debug ? ': ' + e.message : '') }, { status: 500 });
}

function handleError(e: Error | HttpError): Response {
	if (!('body' in e)) return failure(e);
	console.error(e);
	return json(e.body, { status: e.status });
}

export async function handle(request: AxiumRequest): Promise<Response> {
	const route = resolveRoute(request);

	if (!route && request.url.pathname === '/') redirect(303, '/_axium/default');

	if (config.debug) console.log(request.method.padEnd(7), route ? route.path : request.url.pathname);

	if (!route) return new Response('Not Found', { status: 404 });

	if (route.server == true) {
		if (route.api) return await apiHandler(request, route).catch(handleError);

		try {
			const result = await route[request.method](request);
			if (result instanceof Response) return result;
			return json(result);
		} catch (e) {
			return failure(e);
		}
	}

	const data = await route.load?.(request);

	const { head, body } = render(route.page);
	options.templates.app({ head, body, assets: config.web.assets });
}
