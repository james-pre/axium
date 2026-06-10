import type { AsyncResult } from '@axium/core';
import { checkAuthForUser, requireSession } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import * as z from 'zod';
import * as contact from '../common.js';
import { contactsFields, insertContactFields, tryAutoLink } from './db.js';

function splitInit(init: contact.Init): [contact.InitNoExternal, contact.OnlyExternal] {
	const { addresses, emails, phones, dates, relationships, custom, ...rest } = init;
	return [rest, { addresses, emails, phones, dates, relationships, custom }];
}

addRoute({
	path: '/api/users/:id/contacts',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/contacts'> {
		await checkAuthForUser(request, userId);

		return await database.selectFrom('contacts').selectAll().select(contactsFields).where('userId', '=', userId).execute();
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/contacts'> {
		const init = await parseBody(request, contact.Init);

		await checkAuthForUser(request, userId);

		await tryAutoLink(init);
		const [contactInit, fieldsInit] = splitInit(init);

		const tx = await database.startTransaction().execute();

		try {
			const contact = await tx
				.insertInto('contacts')
				.values({ ...contactInit, userId })
				.returningAll()
				.executeTakeFirstOrThrow();

			const rest = await insertContactFields(tx, contact.id, fieldsInit);

			await tx.commit().execute();

			return Object.assign(contact, rest);
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
	},
});

addRoute({
	path: '/api/contacts/:id',
	params: { id: z.uuid() },
	async GET(request, { id }): AsyncResult<'GET', 'contacts/:id'> {
		const contact = await database
			.selectFrom('contacts')
			.selectAll()
			.select(contactsFields)
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		await checkAuthForUser(request, contact.userId);

		return contact;
	},
	async PATCH(request, { id }): AsyncResult<'PATCH', 'contacts/:id'> {
		const init = await parseBody(request, contact.Init);

		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		await checkAuthForUser(request, userId);

		await tryAutoLink(init);
		const [contactInit, fieldsInit] = splitInit(init);

		const tx = await database.startTransaction().execute();

		try {
			const contact = await database
				.updateTable('contacts')
				.set({ ...contactInit, updatedAt: new Date() })
				.where('id', '=', id)
				.returningAll()
				.executeTakeFirstOrThrow();

			await Promise.all([
				tx.deleteFrom('contact_addresses').where('id', '=', id).execute(),
				tx.deleteFrom('contact_emails').where('id', '=', id).execute(),
				tx.deleteFrom('contact_phones').where('id', '=', id).execute(),
				tx.deleteFrom('contact_dates').where('id', '=', id).execute(),
				tx.deleteFrom('contact_relationships').where('id', '=', id).execute(),
				tx.deleteFrom('contact_custom').where('id', '=', id).execute(),
			]);

			const rest = await insertContactFields(tx, contact.id, fieldsInit);

			await tx.commit().execute();

			return Object.assign(contact, rest);
		} catch (e) {
			await tx.rollback().execute();
			throw e;
		}
	},
	async DELETE(request, { id }): AsyncResult<'DELETE', 'contacts/:id'> {
		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		await checkAuthForUser(request, userId);

		return await database
			.deleteFrom('contacts')
			.where('id', '=', id)
			.returningAll()
			.returning(contactsFields)
			.executeTakeFirstOrThrow();
	},
});

addRoute({
	path: '/api/contact-discovery',
	async POST(request): AsyncResult<'POST', 'contact-discovery'> {
		const query = await parseBody(request, z.string().max(100));

		const { userId } = await requireSession(request);

		return await database
			.selectFrom('contacts')
			.selectAll()
			.where('userId', '=', userId)
			.where(eb =>
				eb.or([
					eb(eb.fn('concat_ws', [eb.val(' '), 'givenName', 'givenName2', 'surname']), 'like', `%${query}%`),
					eb('id', 'in', eb.selectFrom('contact_emails').select('id').where('email', 'like', `%${query}%`)),
					eb(
						'id',
						'in',
						eb
							.selectFrom('contact_phones')
							.select('id')
							.where(eb => eb.cast('number', 'text'), 'like', `%${query}%`)
					),
					eb(
						'id',
						'in',
						eb
							.selectFrom('contact_addresses')
							.select('id')
							.where(
								eb =>
									eb.fn('concat_ws', [
										eb.val(' '),
										'street1',
										'street2',
										'locality',
										'subdivision',
										'postalCode',
										'country',
									]),
								'like',
								`%${query}%`
							)
					),
				])
			)
			.execute();
	},
});
