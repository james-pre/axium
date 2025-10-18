import type { App } from '@axium/core';
import type { Result } from '@axium/core/api';
import { requestMethods } from '@axium/core/requests';
import pkg from '../../package.json' with { type: 'json' };
import { apps } from '../apps.js';
import { getSessionAndUser } from '../auth.js';
import { config } from '../config.js';
import { plugins } from '../plugins.js';
import { error, getToken } from '../requests.js';
import { addRoute, routes } from '../routes.js';

addRoute({
	path: '/api/metadata',
	async GET(request): Result<'GET', 'metadata'> {
		if (!config.debug) {
			const token = getToken(request);
			if (!token) error(401, 'Missing session token');
			const session = await getSessionAndUser(token);
			if (!session) error(401, 'Invalid session');
			if (!session.user.isAdmin) error(403, 'User is not an administrator');
			if (session.user.isSuspended) error(403, 'User is suspended');
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
								Object.entries(route.params || {}).map(([key, type]) => [key, type ? type.def.type : null])
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
	async GET(): Result<'GET', 'apps'> {
		const result: App[] = [];

		for (const app of apps.values()) {
			if (config.apps.disabled.includes(app.id)) continue;
			result.push(app);
		}

		return result;
	},
});
