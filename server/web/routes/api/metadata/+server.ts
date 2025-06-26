import { error, json, type RequestEvent } from '@sveltejs/kit';
import { config } from '@axium/server/config.js';
import { version } from '../../../../package.json' with { type: 'json' };
import { routes, requestMethods } from '@axium/server/routes.js';
import { plugins } from '@axium/server/plugins.js';

export function GET(event: RequestEvent): Response {
	if (config.api.disable_metadata) {
		error(401, { message: 'API metadata is disabled' });
	}

	return json({
		version,
		routes: Object.fromEntries(
			routes
				.entries()
				.filter(([path]) => path.startsWith('/api/'))
				.map(([path, route]) => [path, { methods: requestMethods.filter(m => m in route) }])
		),
		plugins: Object.fromEntries(plugins.values().map(plugin => [plugin.id, plugin.version])),
	});
}
