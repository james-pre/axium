import type { Passkey, Session, Verification } from '@axium/core/api';
import type { User } from '@axium/core/user';
import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Optional } from 'utilium';
import { connect, database as db } from './database.js';

export interface UserInternal extends User {
	password?: string | null;
	salt?: string | null;
}

export async function createUser(data: Optional<UserInternal, 'id'>) {
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

export async function updateUser({ id, ...user }: UserInternal) {
	connect();
	const query = db.updateTable('users').set(user).where('id', '=', id);
	return await query.returningAll().executeTakeFirstOrThrow();
}

export async function deleteUser(id: string) {
	connect();
	await db.deleteFrom('users').where('users.id', '=', id).executeTakeFirst();
}

export interface SessionInternal extends Session {
	token: string;
}

const in30days = () => new Date(Date.now() + 2592000000);

export async function createSession(userId: string) {
	connect();
	const session: SessionInternal = {
		id: randomUUID(),
		userId,
		token: randomBytes(64).toString('base64'),
		expires: in30days(),
		created: new Date(),
	};
	await db.insertInto('sessions').values(session).execute();
	return session;
}

export async function checkExpiration(session: SessionInternal) {
	if (session.expires.getTime() > Date.now()) return;
	await db.deleteFrom('sessions').where('sessions.id', '=', session.id).executeTakeFirstOrThrow();
	throw new Error('Session expired');
}

export interface SessionAndUser {
	user: UserInternal;
	session: SessionInternal;
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

export async function getSession(sessionId: string): Promise<SessionInternal> {
	connect();
	const session = await db.selectFrom('sessions').selectAll().where('id', '=', sessionId).executeTakeFirstOrThrow();
	await checkExpiration(session);
	return session;
}

export async function getSessions(userId: string): Promise<SessionInternal[]> {
	connect();
	return await db.selectFrom('sessions').selectAll().where('userId', '=', userId).execute();
}

export async function updateSession(session: SessionInternal) {
	connect();
	const query = db.updateTable('sessions').set(session).where('sessions.token', '=', session.token);
	return await query.returningAll().executeTakeFirstOrThrow();
}

export type VerificationRole = 'verify_email' | 'login';

export interface VerificationInternal extends Verification {
	token: string;
	role: VerificationRole;
}

/**
 * Create a verification
 * @param expires How long the token should be valid for in seconds
 */
export async function createVerification(role: VerificationRole, userId: string, expires: number): Promise<VerificationInternal> {
	const token = randomBytes(64).toString('base64url');
	const verification: VerificationInternal = { userId, token, expires: new Date(Date.now() + expires * 1000), role };
	connect();
	await db.insertInto('verifications').values(verification).executeTakeFirstOrThrow();
	setTimeout(() => {
		void db.deleteFrom('verifications').where('verifications.token', '=', verification.token).execute();
	}, expires * 1000);
	return verification;
}

export async function useVerification(role: VerificationRole, userId: string, token: string): Promise<VerificationInternal | undefined> {
	connect();
	const query = db.deleteFrom('verifications').where('verifications.token', '=', token).where('verifications.userId', '=', userId).where('verifications.role', '=', role);
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

export interface PasskeyInternal extends Passkey {
	publicKey: Uint8Array;
	counter: number;
}

function parsePasskey(passkey: DBPasskey): PasskeyInternal {
	return {
		...passkey,
		deviceType: passkey.deviceType as CredentialDeviceType,
		transports: passkey.transports?.split(',') as AuthenticatorTransportFuture[],
	};
}

export async function getPasskey(id: string): Promise<PasskeyInternal | null> {
	connect();
	const result = await db.selectFrom('passkeys').selectAll().where('id', '=', id).executeTakeFirst();
	if (!result) return null;
	return parsePasskey(result);
}

export async function createPasskey(passkey: Omit<PasskeyInternal, 'createdAt'>): Promise<PasskeyInternal> {
	connect();
	const result = await db
		.insertInto('passkeys')
		.values({ ...passkey, transports: passkey.transports?.join(',') })
		.returningAll()
		.executeTakeFirstOrThrow();
	return parsePasskey(result);
}

export async function getPasskeysByUserId(userId: string): Promise<PasskeyInternal[]> {
	connect();
	const passkeys = await db.selectFrom('passkeys').selectAll().where('userId', '=', userId).execute();
	return passkeys.map(parsePasskey);
}

export async function updatePasskeyCounter(id: PasskeyInternal['id'], newCounter: PasskeyInternal['counter']): Promise<PasskeyInternal> {
	connect();
	await db.updateTable('passkeys').set({ counter: newCounter }).where('id', '=', id).executeTakeFirstOrThrow();
	const passkey = await getPasskey(id);
	if (!passkey) throw new Error('Passkey not found');
	return passkey;
}
