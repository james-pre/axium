import type { AsyncResult, Result } from '@axium/core';
import * as features from '@axium/core/features';
import * as z from 'zod';
import { checkAuthForUser } from '../auth.js';
import { error, parseBody } from '../requests.js';
import { addRoute } from '../routes.js';
import { assertAdmin } from './admin.js';

addRoute({
	path: '/api/users/:id/features',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/features'> {
		await checkAuthForUser(request, userId);

		// @todo support user customization
		return features.getAll().toArray();
	},
	async POST(request, { id: userId }): AsyncResult<'POST', 'users/:id/features'> {
		await checkAuthForUser(request, userId);

		const values = await parseBody(request, features.Values);

		for (const id of Object.keys(values)) {
			const feature = features.get(id);
			if (!feature) error(404, 'Feature is not defined: ' + id);
			if (!feature.user) error(405, 'Feature can not be changed by users: ' + id);
		}

		error(501, 'Per-user features are not implemented');
	},
});

addRoute({
	path: '/api/features',
	GET(): Result<'GET', 'features'> {
		return features.getAll().toArray();
	},
	async POST(request): AsyncResult<'POST', 'features'> {
		await assertAdmin(this, request, true);

		const values = await parseBody(request, features.Values);

		for (const id of Object.keys(values)) {
			if (!features.get(id)) error(404, 'Feature is not defined: ' + id);
		}

		for (const [id, value] of Object.entries(values)) features.set(id, value, true);

		return Object.fromEntries(features.getAll().map(f => [f.id, f.value]));
	},
});
