import { apps } from '@axium/core';
import { debug } from '@axium/core/node/io';
import type { RequestMethod } from '@axium/core/requests';
import type { Component } from 'svelte';
import type z from 'zod';
import config from './config.js';
import { _unique } from './state.js';

type RouteParams = Record<string, z.ZodType>;

type ParamValues<P extends RouteParams> = { [K in keyof P]: z.infer<P[K]> };

export type MaybePromise<T> = T | Promise<T>;

export type EndpointHandlers<Params, This = unknown> = Partial<
	Record<RequestMethod, (this: This, request: Request, params: Params) => MaybePromise<object | Response>>
>;

/**
 * A route with server-side handlers for different HTTP methods.
 */
export interface ServerRouteInit<Params extends RouteParams = RouteParams> extends EndpointHandlers<
	ParamValues<Params>,
	RouteCommon<Params>
> {
	path: string;
	params?: Params;
	api?: boolean;
}

export interface WebRouteInit<Params extends RouteParams = RouteParams> {
	path: string;
	params?: Params;
	load?(request: Request): object | Promise<object>;
	/** the Svelte page */
	page?: Component;
}

export type RouteInit<Params extends RouteParams = RouteParams> = ServerRouteInit<Params> | WebRouteInit<Params>;

export interface RouteCommon<Params extends RouteParams = RouteParams> {
	path: string;
	params?: Params;
}

export interface ServerRoute<Params extends RouteParams = RouteParams> extends RouteCommon<Params>, EndpointHandlers<ParamValues<Params>> {
	api: boolean;
	server: true;
}

export interface WebRoute<Params extends RouteParams = RouteParams> extends RouteCommon<Params> {
	server: false;
	load?(request: Request): object | Promise<object>;
	page: Component;
}

export type Route<Params extends RouteParams = RouteParams> = ServerRoute<Params> | WebRoute<Params>;

/**
 * @internal
 */
export const routes = _unique('routes', new Map<string, Route<any>>());

/**
 * @category Plugin API
 */
export function addRoute<const P extends RouteParams = RouteParams>(opt: RouteInit<P>): void {
	const route = { ...opt, server: !('page' in opt) } as Route<P> & { api?: boolean };

	if (!route.path.startsWith('/')) {
		throw new Error(`Route path must start with a slash: ${route.path}`);
	}

	if (route.path.startsWith('/api/')) route.api = true;
	if (route.api && !route.server) throw new Error(`API routes cannot have a client page: ${route.path}`);

	routes.set(route.path, route as any);
	debug('Added route: ' + route.path);
}

/**
 * Resolve a request URL into a route.
 * This handles parsing of parameters in the URL.
 */
export function resolveRoute<P extends RouteParams = RouteParams>(url: URL): [Route<P>, params: ParamValues<P>] | void {
	const { pathname } = url;

	if (routes.has(pathname) && !pathname.split('/').some(p => p.startsWith(':'))) {
		return [routes.get(pathname)!, {}] as [Route<P>, ParamValues<P>];
	}

	// Otherwise we must have a parameterized route
	_routes: for (const route of routes.values()) {
		const params: Record<string, string> = {};

		// Split the path and route into parts, zipped together
		const pathParts = pathname.split('/').filter(v => v);

		// Skips routes in disabled apps
		if (apps.has(pathParts[0]) && config.apps.disabled.includes(pathParts[0])) continue;

		for (const routePart of route.path.split('/').filter(v => v)) {
			const pathPart = pathParts.shift();

			if (!pathPart) continue _routes;

			if (pathPart == routePart) continue;

			if (!routePart.startsWith(':')) continue _routes;

			params[routePart.slice(1)] = pathPart;
		}

		// we didn't find a match, since an exact match would have been found already
		if (pathParts.length || !Object.keys(params).length) continue;

		return [route, params as ParamValues<P>];
	}
}
