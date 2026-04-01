import { getConfig, type Country } from '@axium/core';
import { database, type Schema as DB } from '@axium/server/database';
import type { FromFile as FromSchemaFile } from '@axium/server/db/schema';
import { error } from '@axium/server/requests';
import type { AliasedRawBuilder, ControlledTransaction, ExpressionBuilder } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type schema from '../../db.json';
import * as contact from '../common.js';

declare module '@axium/server/database' {
	interface _DB extends FromSchemaFile<typeof schema> {}
	export interface Schema extends _DB {
		contact_addresses: _DB['contact_addresses'] & { country: Country };
	}
}

export function contactsFields(eb: ExpressionBuilder<DB, 'contacts'>) {
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
export async function tryAutoLink(init: contact.Init): Promise<void> {
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

export async function insertContactFields(
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
