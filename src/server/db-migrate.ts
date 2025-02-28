import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('User')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('name', 'text')
		.addColumn('email', 'text', col => col.unique().notNull())
		.addColumn('emailVerified', 'timestamptz')
		.addColumn('image', 'text')
		.execute();

	await db.schema
		.createTable('Account')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.references('User.id').onDelete('cascade').notNull())
		.addColumn('type', 'text', col => col.notNull())
		.addColumn('provider', 'text', col => col.notNull())
		.addColumn('providerAccountId', 'text', col => col.notNull())
		.addColumn('refresh_token', 'text')
		.addColumn('access_token', 'text')
		.addColumn('expires_at', 'bigint')
		.addColumn('token_type', 'text')
		.addColumn('scope', 'text')
		.addColumn('id_token', 'text')
		.addColumn('session_state', 'text')
		.execute();

	await db.schema
		.createTable('Session')
		.addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('userId', 'uuid', col => col.references('User.id').onDelete('cascade').notNull())
		.addColumn('sessionToken', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute();

	await db.schema
		.createTable('VerificationToken')
		.addColumn('identifier', 'text', col => col.notNull())
		.addColumn('token', 'text', col => col.notNull().unique())
		.addColumn('expires', 'timestamptz', col => col.notNull())
		.execute();

	await db.schema.createIndex('Account_userId_index').on('Account').column('userId').execute();

	await db.schema.createIndex('Session_userId_index').on('Session').column('userId').execute();

	await db.schema
		.createTable('Authenticator')
		.addColumn('credentialID', 'text', col => col.primaryKey().notNull())
		.addColumn('userId', 'text', col => col.references('User.id').onDelete('cascade').onUpdate('cascade').notNull())
		.addColumn('providerAccountId', 'text', col => col.notNull())
		.addColumn('credentialPublicKey', 'text', col => col.notNull())
		.addColumn('counter', 'integer', col => col.notNull())
		.addColumn('credentialDeviceType', 'text', col => col.notNull())
		.addColumn('credentialBackedUp', 'boolean', col => col.notNull())
		.addColumn('transports', 'text')
		.execute();

	await db.schema.createIndex('Authenticator_credentialID_key').on('Authenticator').column('credentialID').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('Account').ifExists().execute();
	await db.schema.dropTable('Session').ifExists().execute();
	await db.schema.dropTable('User').ifExists().execute();
	await db.schema.dropTable('VerificationToken').ifExists().execute();
	await db.schema.dropTable('Authenticator').ifExists().execute();
}
