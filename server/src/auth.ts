import type { Passkey, Session, Verification } from '@axium/core/api';
import type { User } from '@axium/core/user';
import type { RequestEvent } from '@sveltejs/kit';
import type { Insertable } from 'kysely';
import { randomBytes, randomUUID } from 'node:crypto';
import { connect, database as db, userFromId, type Schema } from './database.js';

export interface UserInternal extends User {
	isAdmin: boolean;
	/** Tags are internal, roles are public */
	tags: string[];
}

export async function getUser(id: string): Promise<UserInternal> {
	connect();
	return await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

export async function updateUser({ id, ...user }: Insertable<Schema['users']>): Promise<UserInternal> {
	connect();
	const query = db.updateTable('users').set(user).where('id', '=', id);
	return await query.returningAll().executeTakeFirstOrThrow();
}

export interface SessionInternal extends Session {
	token: string;
}

const in30days = () => new Date(Date.now() + 2592000000);
const in10minutes = () => new Date(Date.now() + 600000);

export async function createSession(userId: string, elevated: boolean = false) {
	connect();
	const session: SessionInternal = {
		id: randomUUID(),
		userId,
		token: randomBytes(64).toString('base64'),
		expires: elevated ? in10minutes() : in30days(),
		elevated,
		created: new Date(),
	};
	await db.insertInto('sessions').values(session).execute();
	return session;
}

export interface SessionAndUser extends SessionInternal {
	user: UserInternal;
}

export async function getSessionAndUser(token: string): Promise<SessionAndUser> {
	connect();
	const result = await db
		.selectFrom('sessions')
		.selectAll()
		.select(userFromId)
		.where('sessions.token', '=', token)
		.where('sessions.expires', '>', new Date())
		.executeTakeFirstOrThrow();

	if (!result.user) throw new Error('Session references non-existing user');
	return result;
}

export async function getSession(sessionId: string): Promise<SessionInternal> {
	connect();
	return await db
		.selectFrom('sessions')
		.selectAll()
		.where('id', '=', sessionId)
		.where('sessions.expires', '>', new Date())
		.executeTakeFirstOrThrow();
}

export async function getSessions(userId: string): Promise<SessionInternal[]> {
	connect();
	return await db.selectFrom('sessions').selectAll().where('userId', '=', userId).where('sessions.expires', '>', new Date()).execute();
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
	const query = db
		.deleteFrom('verifications')
		.where('verifications.token', '=', token)
		.where('verifications.userId', '=', userId)
		.where('verifications.role', '=', role);
	return await query.returningAll().executeTakeFirst();
}

export interface PasskeyInternal extends Passkey {
	publicKey: Uint8Array;
	counter: number;
}

export async function getPasskey(id: string): Promise<PasskeyInternal> {
	connect();
	return await db.selectFrom('passkeys').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

export async function createPasskey(passkey: Omit<PasskeyInternal, 'createdAt'>): Promise<PasskeyInternal> {
	connect();
	const result = await db.insertInto('passkeys').values(passkey).returningAll().executeTakeFirstOrThrow();
	return result;
}

export async function getPasskeysByUserId(userId: string): Promise<PasskeyInternal[]> {
	connect();
	return await db.selectFrom('passkeys').selectAll().where('userId', '=', userId).execute();
}

export async function updatePasskeyCounter(id: PasskeyInternal['id'], newCounter: PasskeyInternal['counter']): Promise<PasskeyInternal> {
	connect();
	await db.updateTable('passkeys').set({ counter: newCounter }).where('id', '=', id).executeTakeFirstOrThrow();
	const passkey = await getPasskey(id);
	if (!passkey) throw new Error('Passkey not found');
	return passkey;
}

export async function authenticate(event: RequestEvent): Promise<SessionAndUser | null> {
	const maybe_header = event.request.headers.get('Authorization');
	const token = maybe_header?.startsWith('Bearer ') ? maybe_header.slice(7) : event.cookies.get('session_token');

	if (!token) return null;

	return await getSessionAndUser(token).catch(() => null);
}
