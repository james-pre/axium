import { apps, type RequestMethod } from '@axium/core';
import { _debugOutput, debug, warn, info } from '@axium/core/node/io';
import { plugins } from '@axium/core/plugins';
import '@axium/server/api/index';
import { loadDefaultConfigs, reloadConfigs } from '@axium/server/config';
import { clean, connect, database } from '@axium/server/database';
import { dirs, logger } from '@axium/server/io';
import { allLogLevels } from 'logzen';
import { createWriteStream, readFileSync } from 'node:fs';
import type { IncomingMessage, Server } from 'node:http';
import { createServer, ServerResponse } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { join } from 'node:path/posix';
import { styleText } from 'node:util';
import config from './config.js';
import { convertFromResponse, convertToRequest } from './internal_requests.js';
import { error, handleAPIRequest, handleResponseError, json, noCacheHeaders } from './requests.js';
import { resolveRoute, type MaybePromise } from './routes.js';

const template = readFileSync(join(import.meta.dirname, '../template.html'), 'utf-8');

function fillSvelteKitTemplate(
	{ head, body }: Record<'head' | 'body', string>,
	env: Record<string, string> = {},
	nonce: string = ''
): string {
	return (
		template
			.replaceAll('%sveltekit.head%', head)
			.replaceAll('%sveltekit.body%', body)
			.replaceAll('%sveltekit.assets%', '')
			// Unused for now.
			.replaceAll('%sveltekit.nonce%', nonce)
			.replace(/%sveltekit\.env\.([^%]+)%/g, (_match: string, key: string) => env[key] ?? '')
	);
}

export const appDisabledContent = {
	head: '<title>App Disabled</title>',
	body: '<h1>App Disabled</h1><p>This app is currently disabled.</p>',
};

async function handleRequestDefault(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const [route, params] = resolveRoute(url) ?? [];

	if (!route && url.pathname === '/' && config.debug_home)
		return new Response(null, { status: 303, headers: { Location: '/_axium/default' } });

	if (config.debug) console.log(styleText('blueBright', req.method.padEnd(7)), route ? route.path : url.pathname);

	if (!route) {
		// Check to see if this is for an app that is disabled.
		const maybeApp = url.pathname.split('/')[1];
		if (apps.has(maybeApp) && config.apps.disabled.includes(maybeApp)) {
			const body = fillSvelteKitTemplate(appDisabledContent);
			return new Response(body, { headers: noCacheHeaders, status: 503 });
		}

		return new Response('Not Found', { status: 404 });
	}

	if (route.server == true) {
		if (route.api) return await handleAPIRequest(req, params!, route).catch(handleResponseError);

		const run = route[req.method as RequestMethod];
		if (typeof run !== 'function') {
			error(405, `Method ${req.method} not allowed for ${route.path}`);
		}
		try {
			const result = await run(req, params!);
			if (result instanceof Response) return result;
			return json(result);
		} catch (e: any) {
			return handleResponseError(e);
		}
	}

	/* const data = await route.load?.(req);

	const body = fillSvelteKitTemplate(render(route.page, { props: { data } }));

	return new Response(body, {
		headers: config.web.disable_cache ? noCacheHeaders : {},
		status: 200,
	}); */

	return json({ message: 'Not Implemented' }, { status: 501 });
}

const kNext = Symbol('next');

function __next(error?: any): never {
	throw { [kNext]: error };
}

export interface ServeOptions {
	secure: boolean;
	ssl_key: string;
	ssl_cert: string;
	build: string;
	multiBuild: boolean;
}

async function _getMultiBuildHandler(): Promise<(req: IncomingMessage, res: ServerResponse) => void> {
	const handlers: ((req: IncomingMessage, res: ServerResponse, next: (error?: any) => never) => void)[] = [];

	for (const plugin of plugins.values()) {
		if (!plugin.server?.http_handler) continue;

		try {
			const { handler } = await import(join(plugin.dirname, plugin.server.http_handler));
			handlers.push(handler);
			debug(`Loaded plugin handler: ${plugin.name}`);
		} catch (e: any) {
			warn(
				`Failed to load plugin HTTP handler for ${plugin.name} ${_debugOutput ? ': ' + (e instanceof Error ? e.message : e) : ''}`
			);
		}
	}

	// @ts-expect-error 7016 - it is plain JS
	const { handler: handleFrontendRequest } = await import('../build/handler.js');
	handlers.push(handleFrontendRequest);

	function handle(incoming: IncomingMessage, response: ServerResponse) {
		for (const handler of handlers) {
			const maybeResponse = new ServerResponse(incoming);
			try {
				handler(incoming, maybeResponse, __next);
			} catch (e: any) {
				if (!e || !(kNext in e)) {
					response.statusCode = 500;
					response.end('Internal Server Error');
					console.error(e);
					return;
				}

				console.debug(`next@${handler.name} (${e[kNext]})`);
			}

			if (maybeResponse.statusCode != 404) {
				response.setHeaders(new Map(Object.entries(maybeResponse.getHeaders() as any)));
			}
		}

		const req = convertToRequest(incoming);
		void handleRequestDefault(req).then(res => convertFromResponse(response, res));
	}

	return handle;
}

async function _runRoute(
	run: (request: Request, params: Partial<Record<string, string>>) => MaybePromise<object | Response>,
	request: Request,
	params: Partial<Record<string, string>>
): Promise<Response> {
	try {
		const result = await run(request, params);
		if (result instanceof Response) return result;
		return json(result);
	} catch (e: any) {
		return handleResponseError(e);
	}
}

async function _getLinkedBuildHandler(
	buildPath: string = '../build/handler.js'
): Promise<(req: IncomingMessage, res: ServerResponse) => void> {
	const { handler: handleFrontendRequest } = await import(buildPath);

	return function handle(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url!, config.auth.origin);
		const [route, params = {}] = resolveRoute(url) ?? [];

		if (!route && url.pathname === '/' && config.debug_home) {
			res.writeHead(303, { Location: '/_axium/default' }).end();
			return;
		}

		if (config.debug) console.log(styleText('blueBright', req.method!.padEnd(7)), route ? route.path : url.pathname);

		if (route && route.server == true) {
			const request = convertToRequest(req);
			if (route.api) {
				void handleAPIRequest(request, params, route)
					.catch(handleResponseError)
					.then(response => convertFromResponse(res, response));
				return;
			}

			const run = route[request.method as RequestMethod]?.bind(route);
			if (typeof run !== 'function') {
				res.writeHead(405).end(`Method ${request.method} not allowed for ${route.path}`);
				return;
			}
			void _runRoute(run, request, params).then(response => convertFromResponse(res, response));
			return;
		}

		// Check to see if this is for an app that is disabled.
		const maybeApp = url.pathname.split('/')[1];
		if (apps.has(maybeApp) && config.apps.disabled.includes(maybeApp)) {
			const body = fillSvelteKitTemplate(appDisabledContent);
			res.writeHead(503, noCacheHeaders).end(body);
			return;
		}

		handleFrontendRequest(req, res);
		return;
	};
}

export async function serve(opt: Partial<ServeOptions>): Promise<Server> {
	const handle = await _getLinkedBuildHandler(opt.build);

	if (!opt.secure && !config.web.secure) return createServer(handle);

	return createSecureServer(
		{ key: readFileSync(opt.ssl_key || config.web.ssl_key), cert: readFileSync(opt.ssl_cert || config.web.ssl_cert) },
		handle
	);
}

/**
 * Perform initial setup for when the server is serving web pages.
 */
export async function init() {
	logger.attach(createWriteStream(join(dirs.at(-1)!, 'server.log')), { output: allLogLevels });
	await loadDefaultConfigs();
	connect();
	await clean({});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	process.on('beforeExit', () => database.destroy());

	process.on('SIGHUP', () => {
		info('Reloading configuration due to SIGHUP.');
		void reloadConfigs();
	});
}
