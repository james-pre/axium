import type { User } from '@axium/core/user';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
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
	created: Date;
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
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports: AuthenticatorTransportFuture[];
}

export async function createUser(data: Optional<User, 'id'>) {
	connect();
	const user = { id: randomUUID(), ...data };
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
		created: new Date(),
	};
	await db.insertInto('sessions').values(session).execute();
	return session;
}

export async function checkExpiration(session: Session) {
	if (session.expires.getTime() > Date.now()) return;
	await db.deleteFrom('sessions').where('sessions.id', '=', session.id).executeTakeFirstOrThrow();
	throw new Error('Session expired');
}

export interface SessionAndUser {
	user: User;
	session: Session;
}

export async function getSessionAndUser(token: string): Promise<SessionAndUser> {
	connect();
	const result = await db
		.selectFrom('sessions')
		.innerJoin('users', 'users.id', 'sessions.userId')
		.selectAll('users')
		.select(['sessions.expires', 'sessions.id as sessionId', 'created'])
		.where('sessions.token', '=', token)
		.executeTakeFirst();
	if (!result) throw new Error('Session not found');

	const { sessionId, created, expires, ...user } = result;
	const session = { token, userId: user.id, expires, id: sessionId, created };
	await checkExpiration(session);
	return { user, session };
}

export async function getSession(sessionId: string): Promise<Session> {
	connect();
	const session = await db.selectFrom('sessions').selectAll().where('id', '=', sessionId).executeTakeFirstOrThrow();
	await checkExpiration(session);
	return session;
}

export async function getSessions(userId: string): Promise<Session[]> {
	connect();
	return await db.selectFrom('sessions').selectAll().where('userId', '=', userId).execute();
}

export async function updateSession(session: Session) {
	connect();
	const query = db.updateTable('sessions').set(session).where('sessions.token', '=', session.token);
	return await query.returningAll().executeTakeFirstOrThrow();
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

interface DBPasskey {
	id: string;
	name: string | null;
	createdAt: Date;
	userId: string;
	publicKey: Uint8Array;
	counter: number;
	deviceType: string;
	backedUp: boolean;
	transports: string | null;
}

function parsePasskey(passkey: DBPasskey): Passkey {
	return {
		...passkey,
		deviceType: passkey.deviceType as CredentialDeviceType,
		transports: passkey.transports?.split(',') as AuthenticatorTransportFuture[],
	};
}

export async function getPasskey(id: string): Promise<Passkey | null> {
	connect();
	const result = await db.selectFrom('passkeys').selectAll().where('id', '=', id).executeTakeFirst();
	if (!result) return null;
	return parsePasskey(result);
}

export async function createPasskey(passkey: Omit<Passkey, 'createdAt'>): Promise<Passkey> {
	connect();
	const result = await db
		.insertInto('passkeys')
		.values({ ...passkey, transports: passkey.transports?.join(',') })
		.returningAll()
		.executeTakeFirstOrThrow();
	return parsePasskey(result);
}

export async function getPasskeysByUserId(userId: string): Promise<Passkey[]> {
	connect();
	const passkeys = await db.selectFrom('passkeys').selectAll().where('userId', '=', userId).execute();
	return passkeys.map(parsePasskey);
}

export async function updatePasskeyCounter(id: Passkey['id'], newCounter: Passkey['counter']): Promise<Passkey> {
	connect();
	await db.updateTable('passkeys').set({ counter: newCounter }).where('id', '=', id).executeTakeFirstOrThrow();
	const passkey = await getPasskey(id);
	if (!passkey) throw new Error('Passkey not found');
	return passkey;
}
