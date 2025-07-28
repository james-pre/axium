import type { Result } from '@axium/core/api';
import { requestMethods } from '@axium/core/requests';
import pkg from '../../package.json' with { type: 'json' };
import { config } from '../config.js';
import { plugins } from '../plugins.js';
import { error } from '../requests.js';
import { addRoute, routes } from '../routes.js';

addRoute({
	path: '/api/metadata',
	async GET(): Result<'GET', 'metadata'> {
		if (config.api.disable_metadata) error(401, 'API metadata is disabled');

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
