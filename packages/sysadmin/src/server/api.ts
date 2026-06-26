import type { AccessControl, AsyncResult } from '@axium/core';
import * as acl from '@axium/server/acl';
import { authRequestForItem, checkAuthForUser } from '@axium/server/auth';
import { database, type Schema } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { Selectable } from 'kysely';
import * as z from 'zod';
import { SystemInit, SystemUserInit, type System } from '../common.js';

function parseSystem<T extends Selectable<Schema['systems']> & { acl?: AccessControl[] }>(system: T, isShared: boolean): System {
	return Object.assign({ acl: [] }, system, { isShared }) satisfies Omit<System, 'type'> & { type: string } as System;
}

addRoute({
	path: '/api/users/:id/sysadmin/systems',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/sysadmin/systems'> {
		const { user } = await checkAuthForUser(request, userId);

		const systems = await database
			.selectFrom('systems')
			.selectAll()
			.select(acl.from('systems'))
			.where(eb => eb.or([eb('userId', '=', userId), acl.existsIn('systems', user)(eb)]))
			.execute()
			.catch(withError('Could not get systems'));

		return systems.map(system => parseSystem(system, system.userId !== userId));
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/sysadmin/systems'> {
		const init = await parseBody(request, SystemInit);

		await checkAuthForUser(request, userId);

		return parseSystem(
			await database
				.insertInto('systems')
				.values({ ...init, userId })
				.returningAll()
				.executeTakeFirstOrThrow()
				.catch(withError('Could not create system')),
			false
		);
	},
});

addRoute({
	path: '/api/sysadmin/systems/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'sysadmin/systems/:id'> {
		const { item, fromACL } = await authRequestForItem(request, 'systems', id, { read: true });

		return parseSystem(item, fromACL);
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'sysadmin/systems/:id'> {
		const init = await parseBody(request, SystemInit);

		const { fromACL } = await authRequestForItem(request, 'systems', id, { edit: true });

		const system = await database
			.updateTable('systems')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.returning(acl.from('systems'))
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update system'));

		return parseSystem(system, fromACL);
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'sysadmin/systems/:id'> {
		const { fromACL } = await authRequestForItem(request, 'systems', id, { manage: true });

		const system = await database
			.deleteFrom('systems')
			.where('id', '=', id)
			.returningAll()
			.returning(acl.from('systems'))
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete system'));

		return parseSystem(system, fromACL);
	},
});

addRoute({
	path: '/api/users/:id/sysadmin/users',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/sysadmin/users'> {
		await checkAuthForUser(request, userId);

		return await database
			.selectFrom('system_users')
			.selectAll()
			.where('userId', '=', userId)
			.execute()
			.catch(withError('Could not get system users'));
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/sysadmin/users'> {
		const init = await parseBody(request, SystemUserInit);

		await checkAuthForUser(request, userId);

		return await database
			.insertInto('system_users')
			.values({ ...init, userId })
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not create system user'));
	},
});

addRoute({
	path: '/api/sysadmin/users/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'sysadmin/users/:id'> {
		const user = await database
			.selectFrom('system_users')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not get system user', 404));

		await checkAuthForUser(request, user.userId);

		return user;
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'sysadmin/users/:id'> {
		const init = await parseBody(request, SystemUserInit);

		const existing = await database
			.selectFrom('system_users')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not get system user', 404));

		await checkAuthForUser(request, existing.userId);

		return await database
			.updateTable('system_users')
			.set(init)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not update system user'));
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'sysadmin/users/:id'> {
		const existing = await database
			.selectFrom('system_users')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Could not get system user', 404));

		await checkAuthForUser(request, existing.userId);

		return await database
			.deleteFrom('system_users')
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Could not delete system user'));
	},
});
