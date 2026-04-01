import { getConfig, type AsyncResult, type Country } from '@axium/core';
import { checkAuthForUser, requireSession } from '@axium/server/auth';
import { database, type Schema as DB } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { error, parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { AliasedRawBuilder, ControlledTransaction, ExpressionBuilder } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import type schema from '../db.json';
import * as contact from './common.js';

declare module '@axium/server/database' {
	interface _DB extends FromSchemaFile<typeof schema> {}
	export interface Schema extends _DB {
		contact_addresses: _DB['contact_addresses'] & { country: Country };
	}
}

function contactsFields(eb: ExpressionBuilder<DB, 'contacts'>) {
	function select<const T extends contact.ExternalField>(field: T): AliasedRawBuilder<contact.OnlyExternal[T], T> {
		return jsonArrayFrom(
			eb
				.selectFrom(`contact_${field}`)
				// @ts-expect-error 2349
				.select(Object.keys(fieldSchemas[field].shape))
				.whereRef('id', '=', 'contacts.id')
		)
			.$castTo<contact.OnlyExternal[T]>()
			.as(field);
	}

	return [select('addresses'), select('emails'), select('phones'), select('dates'), select('relationships'), select('custom')] as const;
}

/**
 * Try to automatically link the contact to a user
 */
async function tryAutoLink(init: contact.Init): Promise<void> {
	if (!getConfig('@axium/contacts').auto_link || init.linkedUserId || !init.emails.length) return;

	const emails = init.emails.map(e => e.email);

	const user = await database.selectFrom('users').select('id').where('email', 'in', emails).executeTakeFirst();
	if (!user) return;

	init.linkedUserId = user.id;
}

const fieldSchemas = {
	addresses: contact.Address,
	emails: contact.Email,
	phones: contact.Phone,
	dates: contact.SigDate,
	relationships: contact.Relationship,
	custom: contact.Custom,
};

function splitInit(init: contact.Init): [contact.InitNoExternal, contact.OnlyExternal] {
	const { addresses, emails, phones, dates, relationships, custom, ...rest } = init;
	return [rest, { addresses, emails, phones, dates, relationships, custom }];
}

async function insertContactFields(
	tx: ControlledTransaction<DB, []>,
	id: string,
	init: contact.OnlyExternal
): Promise<contact.OnlyExternal> {
	for (const [name, data] of [
		['addresses', init.addresses],
		['emails', init.emails],
		['phones', init.phones],
	] as const) {
		let defaultItem;
		for (const item of data) {
			if (!item.isDefault) continue;
			if (defaultItem) error(400, 'Can not have multiple default ' + name);
			defaultItem = item;
		}

		if (!defaultItem && data.length) data[0].isDefault = true;
	}

	async function insertWithId<const T extends contact.ExternalField>(field: T): Promise<Pick<contact.OnlyExternal, T>> {
		const value = init[field];
		if (!value.length) return { [field]: [] } as any as Pick<contact.OnlyExternal, T>;
		const result = (await tx
			.insertInto(`contact_${field}`)
			.values(value.map(item => ({ ...item, id })) as any)
			.returning(Object.keys(fieldSchemas[field].shape) as any)
			.execute()) as any;

		return { [field]: result } as Pick<contact.OnlyExternal, T>;
	}

	const result = await Promise.all([
		insertWithId('addresses'),
		insertWithId('emails'),
		insertWithId('phones'),
		insertWithId('dates'),
		insertWithId('relationships'),
		insertWithId('custom'),
	]);

	return Object.assign(...result);
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
