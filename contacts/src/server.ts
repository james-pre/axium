import { locationKeys, type AsyncResult } from '@axium/core';
import { checkAuthForUser } from '@axium/server/auth';
import { database, type Schema as DB } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { parseBody, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import type { ControlledTransaction, ExpressionBuilder } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import * as z from 'zod';
import type schema from '../db.json';
import { Init } from './common.js';
import type * as contact from './common.js';

declare module '@axium/server/database' {
	export interface Schema extends FromSchemaFile<typeof schema> {}
}

function contactsFields(eb: ExpressionBuilder<DB, 'contacts'>) {
	return [
		jsonArrayFrom(eb.selectFrom('contact_addresses').select([...locationKeys, 'label', 'isDefault'])).as('addresses'),
		jsonArrayFrom(eb.selectFrom('contact_emails').select(['email', 'label', 'isDefault'])).as('emails'),
		jsonArrayFrom(eb.selectFrom('contact_phones').select(['country', 'number', 'label', 'isDefault']))
			.$castTo<contact.Phone[]>()
			.as('phones'),
		jsonArrayFrom(eb.selectFrom('contact_dates').select(['year', 'month', 'day', 'label'])).as('dates'),
		jsonArrayFrom(eb.selectFrom('contact_relationships').select(['to', 'label'])).as('relationships'),
		jsonArrayFrom(eb.selectFrom('contact_custom').select(['label', 'value'])).as('custom'),
	] as const;
}

async function insertContactFields(
	tx: ControlledTransaction<DB, []>,
	id: string,
	addressInit: contact.Address[],
	emailInit: contact.Email[],
	phoneInit: contact.Phone[],
	dateInit: contact.SigDate[],
	relationshipInit: contact.Relationship[],
	customInit: contact.Custom[]
) {
	const [addresses, emails, phones, dates, relationships, custom] = await Promise.all([
		tx
			.insertInto('contact_addresses')
			.values(addressInit.map(addr => ({ ...addr, id })))
			.returning([...locationKeys, 'label', 'isDefault'])
			.execute(),
		tx
			.insertInto('contact_emails')
			.values(emailInit.map(email => ({ ...email, id })))
			.returning(['email', 'label', 'isDefault'])
			.execute(),
		tx
			.insertInto('contact_phones')
			.values(phoneInit.map(phone => ({ ...phone, id })))
			.returning(['country', 'number', 'label', 'isDefault'])
			.execute(),
		tx
			.insertInto('contact_dates')
			.values(dateInit.map(date => ({ ...date, id })))
			.returning(['year', 'month', 'day', 'label'])
			.execute(),
		tx
			.insertInto('contact_relationships')
			.values(relationshipInit.map(relationship => ({ ...relationship, id })))
			.returning(['to', 'label'])
			.execute(),
		tx
			.insertInto('contact_custom')
			.values(customInit.map(item => ({ ...item, id })))
			.returningAll()
			.execute(),
	]);

	return { addresses, emails, phones, dates, relationships, custom };
}

addRoute({
	path: '/api/users/:id/contacts',
	params: { id: z.uuid() },
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/contacts'> {
		await checkAuthForUser(request, userId);

		return await database.selectFrom('contacts').selectAll().select(contactsFields).where('userId', '=', userId).execute();
	},
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/contacts'> {
		const {
			addresses: addressInit,
			emails: emailInit,
			phones: phoneInit,
			dates: dateInit,
			relationships: relationshipInit,
			custom: customInit,
			...init
		} = await parseBody(request, Init);

		await checkAuthForUser(request, userId);

		const tx = await database.startTransaction().execute();

		try {
			const contact = await tx
				.insertInto('contacts')
				.values({ ...init, userId })
				.returningAll()
				.executeTakeFirstOrThrow();

			const rest = await insertContactFields(
				tx,
				contact.id,
				addressInit,
				emailInit,
				phoneInit,
				dateInit,
				relationshipInit,
				customInit
			);

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
		const {
			addresses: addressInit,
			emails: emailInit,
			phones: phoneInit,
			dates: dateInit,
			relationships: relationshipInit,
			custom: customInit,
			...init
		} = await parseBody(request, Init);

		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		await checkAuthForUser(request, userId);

		const tx = await database.startTransaction().execute();

		try {
			const contact = await database.updateTable('contacts').set(init).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

			await tx
				.deleteFrom([
					'contact_addresses',
					'contact_emails',
					'contact_phones',
					'contact_dates',
					'contact_relationships',
					'contact_custom',
				])
				.where('id', '=', id)
				.execute();

			const rest = await insertContactFields(
				tx,
				contact.id,
				addressInit,
				emailInit,
				phoneInit,
				dateInit,
				relationshipInit,
				customInit
			);

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
