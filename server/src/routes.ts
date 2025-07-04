import type { RequestMethod } from '@axium/core/requests';
import type { RequestEvent } from '@sveltejs/kit';
import type { Component } from 'svelte';
import type z from 'zod/v4';
import { apps } from './apps.js';
import config from './config.js';
import { output } from './io.js';

type _Params = Partial<Record<string, string>>;

type MaybePromise<T> = T | Promise<T>;

export type EndpointHandlers<Params extends _Params = _Params> = Partial<
	Record<RequestMethod, (event: RequestEvent<Params>) => MaybePromise<object | Response>>
>;

export type RouteParamOptions = z.ZodType;

export interface CommonRouteOptions<Params extends _Params = _Params> {
	path: string;
	params?: { [K in keyof Params]?: RouteParamOptions };
}

/**
 * A route with server-side handlers for different HTTP methods.
 */
export interface ServerRouteOptions<Params extends _Params = _Params> extends CommonRouteOptions<Params>, EndpointHandlers<Params> {
	api?: boolean;
}

export interface WebRouteOptions extends CommonRouteOptions {
	load?(event: RequestEvent): object | Promise<object>;
	/** the Svelte page */
	page?: Component;
}

export type RouteOptions = ServerRouteOptions | WebRouteOptions;

export interface RouteCommon {
	path: string;
	params?: Record<string, RouteParamOptions>;
}

export interface ServerRoute extends RouteCommon, EndpointHandlers {
	api: boolean;
	server: true;
}

export interface WebRoute extends RouteCommon {
	server: false;
	load?(event: RequestEvent): object | Promise<object>;
	page?: Component;
}

export type Route = ServerRoute | WebRoute;

/**
 * @internal
 */
export const routes = new Map<string, Route>();

export function addRoute(opt: RouteOptions): void {
	const route = { ...opt, server: !('page' in opt) } as Route & { api?: boolean };

	if (!route.path.startsWith('/')) {
		throw new Error(`Route path must start with a slash: ${route.path}`);
	}

	if (route.path.startsWith('/api/')) route.api = true;
	if (route.api && !route.server) throw new Error(`API routes cannot have a client page: ${route.path}`);

	routes.set(route.path, route);
	output.debug('Added route: ' + route.path);
}

/**
 * Resolve a request URL into a route.
 * This handles parsing of parameters in the URL.
 */
export function resolveRoute(event: { url: URL; params?: object }): Route | undefined {
	const { pathname } = event.url;

	if (routes.has(pathname) && !pathname.split('/').some(p => p.startsWith(':'))) return routes.get(pathname);

	// Otherwise we must have a parameterized route
	_routes: for (const route of routes.values()) {
		const params: Record<string, string> = {};

		// Split the path and route into parts, zipped together
		const pathParts = pathname.split('/').filter(Boolean);

		// Skips routes in disabled apps
		if (apps.has(pathParts[0]) && config.apps.disabled.includes(pathParts[0])) continue;

		for (const routePart of route.path.split('/').filter(Boolean)) {
			const pathPart = pathParts.shift();

			if (!pathPart) continue _routes;

			if (pathPart == routePart) continue;

			if (!routePart.startsWith(':')) continue _routes;

			params[routePart.slice(1)] = pathPart;
		}

		// we didn't find a match, since an exact match would have been found already
		if (pathParts.length || !Object.keys(params).length) continue;

		event.params = params;
		return route;
	}
}
