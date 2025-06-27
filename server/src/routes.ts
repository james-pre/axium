import type { RequestMethod } from '@axium/core/requests';
import type { LoadEvent, RequestEvent } from '@sveltejs/kit';
import type z from 'zod/v4';

type _Params = Partial<Record<string, string>>;

export type EndpointHandlers<Params extends _Params = _Params> = Partial<Record<RequestMethod, (event: RequestEvent<Params>) => object | Promise<object>>>;

export type RouteParamOptions = z.ZodType;

export interface CommonRouteOptions<Params extends _Params = _Params> {
	path: string;
	params?: { [K in keyof Params]?: RouteParamOptions };
}

/**
 * A route with server-side handlers for different HTTP methods.
 */
export interface ServerRouteOptions<Params extends _Params = _Params> extends CommonRouteOptions<Params>, EndpointHandlers<Params> {}

export interface WebRouteOptions extends CommonRouteOptions {
	load?(event: RequestEvent): object | Promise<object>;
	/** Path to the Svelte page */
	page?: string;
}

export type RouteOptions = ServerRouteOptions | WebRouteOptions;

export interface RouteCommon {
	path: string;
	params?: Record<string, RouteParamOptions>;
}

export interface ServerRoute extends RouteCommon, EndpointHandlers {
	server: true;
}

export interface WebRoute extends RouteCommon {
	server: false;
	load?(event: LoadEvent): object | Promise<object>;
	page?: string;
}

export type Route = ServerRoute | WebRoute;

/**
 * @internal
 */
export const routes = new Map<string, Route>();

export function addRoute(opt: RouteOptions, _routeMap = routes): void {
	const route = { ...opt, server: !('page' in opt) };

	if (!route.path.startsWith('/')) {
		throw new Error(`Route path must start with a slash: ${route.path}`);
	}

	if (route.path.startsWith('/api/') && !route.server) {
		throw new Error(`API routes cannot have a client page: ${route.path}`);
	}

	_routeMap.set(route.path, route as Route);
}

/**
 * Resolve a request URL into a route.
 * This handles parsing of parameters in the URL.
 */
export function resolveRoute<T extends Route>(event: RequestEvent | LoadEvent, _routeMap: Map<string, T> = routes as Map<string, T>): T | undefined {
	const { pathname } = event.url;

	if (_routeMap.has(pathname) && !pathname.split('/').some(p => p.startsWith(':'))) return _routeMap.get(pathname);

	// Otherwise we must have a parameterized route
	routes: for (const route of _routeMap.values()) {
		const params: Record<string, string> = {};

		// Split the path and route into parts, zipped together
		const pathParts = pathname.split('/').filter(Boolean);

		for (const routePart of route.path.split('/').filter(Boolean)) {
			const pathPart = pathParts.shift();

			if (!pathPart) continue routes;

			if (pathPart == routePart) continue;

			if (!routePart.startsWith(':')) continue routes;

			params[routePart.slice(1)] = pathPart;
		}

		// we didn't find a match, since an exact match would have been found already
		if (!Object.keys(params).length) continue;

		event.params = params;
		return route;
	}
}
