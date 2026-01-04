import type { App, AsyncResult, Result } from '@axium/core';
import { apps } from '@axium/core';
import { plugins } from '@axium/core/plugins';
import { requestMethods } from '@axium/core/requests';
import type { ZodType } from 'zod';
import pkg from '../../package.json' with { type: 'json' };
import { requireSession } from '../auth.js';
import { config } from '../config.js';
import { error } from '../requests.js';
import { addRoute, routes } from '../routes.js';

addRoute({
	path: '/api/metadata',
	async GET(request): AsyncResult<'GET', 'metadata'> {
		if (!config.debug) {
			const { user } = await requireSession(request);
			if (!user.isAdmin) error(403, 'User is not an administrator');
		}

		return {
			version: pkg.version,
			routes: Object.fromEntries(
				routes
					.entries()
					.filter(([path]) => path.startsWith('/api/'))
					.map(([path, route]) => [
						path,
						{
							params: Object.fromEntries(
								Object.entries<ZodType>(route.params || {}).map(([key, type]) => [key, type ? type.def.type : null])
							),
							methods: requestMethods.filter(m => m in route),
						},
					])
			),
			plugins: Object.fromEntries(plugins.values().map(plugin => [plugin.name, plugin.version])),
		};
	},
});

addRoute({
	path: '/api/apps',
	GET(): Result<'GET', 'apps'> {
		const result: App[] = [];

		for (const app of apps.values()) {
			if (config.apps.disabled.includes(app.id)) continue;
			result.push(app);
		}

		return result;
	},
});
