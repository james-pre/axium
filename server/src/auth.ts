import type { User } from '@axium/core/user';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Optional } from 'utilium';
import { connect, database as db } from './database.js';

declare module '@axium/core/user' {
	interface User {
		password?: string | null;
		salt?: string | null;
	}
}

export interface Session {
	id: string;
	userId: string;
	token: string;
	expires: Date;
}

export interface VerificationToken {
	id: string;
	token: string;
	expires: Date;
}

export interface Passkey {
	id: string;
	name?: string | null;
	createdAt: Date;
	userId: string;
	publicKey: Uint8Array;
	counter: number;
	deviceType: string;
	backedUp: boolean;
	transports: AuthenticatorTransportFuture[];
}

export async function createUser(data: Optional<User, 'id'>) {
	connect();
	const user = { ...data, id: randomUUID() };
	await db.insertInto('users').values(user).executeTakeFirstOrThrow();
	return user;
}

export async function getUser(id: string) {
	connect();
	const result = await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
	if (!result) return null;
	return result;
}

export async function getUserByEmail(email: string) {
	connect();
	const result = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
	if (!result) return null;
	return result;
}

export async function updateUser({ id, ...user }: User) {
	connect();
	const query = db.updateTable('users').set(user).where('id', '=', id);
	return await query.returningAll().executeTakeFirstOrThrow();
}

export async function deleteUser(id: string) {
	connect();
	await db.deleteFrom('users').where('users.id', '=', id).executeTakeFirst();
}

const in30days = () => new Date(Date.now() + 2592000000);

export async function createSession(userId: string) {
	connect();
	const session: Session = {
		id: randomUUID(),
		userId,
		token: randomBytes(64).toString('base64'),
		expires: in30days(),
	};
	await db.insertInto('sessions').values(session).execute();
	return session;
}

export async function getSessionAndUser(token: string) {
	connect();
	const result = await db
		.selectFrom('sessions')
		.innerJoin('users', 'users.id', 'sessions.userId')
		.selectAll('users')
		.select(['sessions.expires', 'sessions.userId'])
		.where('sessions.token', '=', token)
		.executeTakeFirst();
	if (!result) return null;
	const { userId, expires, ...user } = result;
	const session = { token, userId, expires };
	return { user, session };
}

export async function updateSession(session: Session) {
	connect();
	const query = db.updateTable('sessions').set(session).where('sessions.token', '=', session.token);
	return await query.returningAll().executeTakeFirstOrThrow();
}

export async function deleteSession(token: string) {
	connect();
	await db.deleteFrom('sessions').where('sessions.token', '=', token).executeTakeFirstOrThrow();
}

export async function createVerificationToken(data: VerificationToken) {
	connect();
	await db.insertInto('verifications').values(data).execute();
	return data;
}

export async function useVerificationToken(id: string, token: string): Promise<VerificationToken | undefined> {
	connect();
	const query = db.deleteFrom('verifications').where('verifications.token', '=', token).where('verifications.id', '=', id);
	return await query.returningAll().executeTakeFirst();
}

export async function getPasskey(id: string): Promise<Passkey | null> {
	connect();
	const result = await db.selectFrom('passkeys').selectAll().where('id', '=', id).executeTakeFirst();
	if (!result) return null;
	return {
		...result,
		transports: result.transports?.split(',') as AuthenticatorTransportFuture[],
	};
}

export async function createPasskey(passkey: Omit<Passkey, 'createdAt'>): Promise<Passkey> {
	connect();
	const result = await db
		.insertInto('passkeys')
		.values({ ...passkey, transports: passkey.transports?.join(',') })
		.returningAll()
		.executeTakeFirstOrThrow();
	return {
		...result,
		transports: result.transports?.split(',') as AuthenticatorTransportFuture[],
	};
}

export async function getPasskeysByUserId(userId: string): Promise<Passkey[]> {
	connect();
	const passkeys = await db.selectFrom('passkeys').selectAll().where('userId', '=', userId).execute();
	return passkeys.map(passkey => ({
		...passkey,
		transports: passkey.transports?.split(',') as AuthenticatorTransportFuture[],
	}));
}

export async function updatePasskeyCounter(id: Passkey['id'], newCounter: Passkey['counter']): Promise<Passkey> {
	connect();
	await db.updateTable('passkeys').set({ counter: newCounter }).where('id', '=', id).executeTakeFirstOrThrow();
	const passkey = await getPasskey(id);
	if (!passkey) throw new Error('Passkey not found');
	return passkey;
}
