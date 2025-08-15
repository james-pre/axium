import type { Result } from '@axium/core/api';
import { requestMethods } from '@axium/core/requests';
import pkg from '../../package.json' with { type: 'json' };
import { config } from '../config.js';
import { plugins } from '../plugins.js';
import { error, getToken } from '../requests.js';
import { addRoute, routes } from '../routes.js';
import { getSessionAndUser } from '../auth.js';

addRoute({
	path: '/api/metadata',
	async GET(event): Result<'GET', 'metadata'> {
		if (!config.debug) {
			const token = getToken(event);
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
