import type { LoadEvent, RequestEvent } from '@sveltejs/kit';
import { pick } from 'utilium';
import type { Route, WebRoute, WebRouteOptions } from './routes.js';
import { addRoute, resolveRoute } from './routes.js';

export interface CreateAppOptions {
	id: string;
	name?: string;
}

export const apps = new Map<string, App>();

export class App {
	public readonly id!: string;
	public name!: string;

	protected readonly routes = new Map<string, WebRoute>();

	public constructor(opt: CreateAppOptions) {
		if (apps.has(opt.id)) throw new ReferenceError(`App with ID "${opt.id}" already exists.`);

		Object.assign(this, pick(opt, 'id', 'name'));

		apps.set(this.id, this);
	}

	public addRoute(route: WebRouteOptions) {
		addRoute(route, this.routes);
	}

	public resolveRoute(event: RequestEvent | LoadEvent): WebRoute | undefined {
		return resolveRoute(event, this.routes);
	}
}
