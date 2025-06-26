import type { RequestEvent } from '@sveltejs/kit';
import type z from 'zod/v4';

export const requestMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'] as const;

export type RequestMethod = (typeof requestMethods)[number];

export type EndpointHandlers = Partial<Record<RequestMethod, (event: RequestEvent) => Promise<object>>>;

export interface RouteParam {
	type?: z.ZodType;
}

/**
 * A route with server-side handlers for different HTTP methods.
 */
export interface Route extends EndpointHandlers {
	path: string;
	params?: Record<string, RouteParam>;
	/** Path to the Svelte page */
	page?: string;
}

/**
 * @internal
 */
export const routes = new Map<string, Route>();

export function addRoute(route: Route) {
	if (!route.path.startsWith('/')) {
		throw new Error(`Route path must start with a slash: ${route.path}`);
	}

	if (route.path.startsWith('/api/') && route.page) {
		throw new Error(`API routes cannot have a client page: ${route.path}`);
	}

	routes.set(route.path, route);
}

/**
 * Resolve a request URL into a route.
 * This handles parsing of parameters in the URL.
 */
export function resolveRoute(event: RequestEvent): Route | undefined {
	const { pathname } = event.url;

	if (routes.has(pathname)) return routes.get(pathname);

	// Otherwise we must have a parameterized route
	for (const route of routes.values()) {
		if (!pathname.startsWith(route.path)) continue;

		const params: Record<string, string> = {};

		for (const [pathPart, routePart] of [pathname.split('/').slice(1), route.path.split('/').slice(1)]) {
			if (pathPart == routePart) continue;

			if (!routePart.startsWith(':')) break;

			params[routePart.slice(1)] = pathPart;
		}

		// no params means we didn't find a match, since an exact match would have been found already
		if (!Object.keys(params).length) {
			continue;
		}

		event.params = params;
		return route;
	}
}
