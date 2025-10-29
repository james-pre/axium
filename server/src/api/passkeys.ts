import type { AsyncResult } from '@axium/core/api';
import { PasskeyChangeable } from '@axium/core/passkeys';
import { omit } from 'utilium';
import * as z from 'zod';
import { checkAuthForUser, getPasskey } from '../auth.js';
import { database as db } from '../database.js';
import { error, parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

addRoute({
	path: '/api/passkeys/:id',
	params: {
		id: z.string(),
	},
	async GET(request, params): AsyncResult<'GET', 'passkeys/:id'> {
		const passkey = await getPasskey(params.id!);
		await checkAuthForUser(request, passkey.userId);
		return omit(passkey, 'counter', 'publicKey');
	},
	async PATCH(request, params): AsyncResult<'PATCH', 'passkeys/:id'> {
		const body = await parseBody(request, PasskeyChangeable);
		const passkey = await getPasskey(params.id!);
		await checkAuthForUser(request, passkey.userId);
		const result = await db
			.updateTable('passkeys')
			.set(body)
			.where('id', '=', passkey.id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update passkey'));

		return omit(result, 'counter', 'publicKey');
	},
	async DELETE(request, params): AsyncResult<'DELETE', 'passkeys/:id'> {
		const passkey = await getPasskey(params.id!);
		await checkAuthForUser(request, passkey.userId);

		const { count } = await db
			.selectFrom('passkeys')
			.select(db.fn.countAll().as('count'))
			.where('userId', '=', passkey.userId)
			.executeTakeFirstOrThrow();

		if (Number(count) <= 1) error(409, 'At least one passkey is required');

		const result = await db
			.deleteFrom('passkeys')
			.where('id', '=', passkey.id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete passkey'));

		return omit(result, 'counter', 'publicKey');
	},
});
