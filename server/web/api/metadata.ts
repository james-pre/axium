import type { Result } from '@axium/core/api';
import { requestMethods } from '@axium/core/requests';
import { config } from '@axium/server/config';
import { plugins } from '@axium/server/plugins';
import { addRoute, routes } from '@axium/server/routes';
import { error } from '@sveltejs/kit';
import pkg from '../../package.json' with { type: 'json' };

addRoute({
	path: '/api/metadata',
	async GET(): Result<'GET', 'metadata'> {
		if (config.api.disable_metadata) {
			error(401, { message: 'API metadata is disabled' });
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
			plugins: Object.fromEntries(plugins.values().map(plugin => [plugin.id, plugin.version])),
		};
	},
});
