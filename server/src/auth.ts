import type { AccessControl, Permission } from '@axium/core';
import type { Passkey, Session, Verification } from '@axium/core/api';
import type { User } from '@axium/core/user';
import type { Insertable } from 'kysely';
import { randomBytes, randomUUID } from 'node:crypto';
import { omit } from 'utilium';
import * as acl from './acl.js';
import { database as db, userFromId, type Schema } from './database.js';
import type { RequestEvent } from './requests.js';
import { error, getToken, withError } from './requests.js';
import { audit } from './audit.js';

export interface UserInternal extends User {
	isAdmin: boolean;
	isSuspended: boolean;
	/** Tags are internal, roles are public */
	tags: string[];
}

export async function getUser(id: string): Promise<UserInternal> {
	return await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

export async function updateUser({ id, ...user }: Insertable<Schema['users']>): Promise<UserInternal> {
	const query = db.updateTable('users').set(user).where('id', '=', id);
	return await query.returningAll().executeTakeFirstOrThrow();
}

export interface SessionInternal extends Session {
	token: string;
}

const in30days = () => new Date(Date.now() + 2592000000);
const in10minutes = () => new Date(Date.now() + 600000);

export async function createSession(userId: string, elevated: boolean = false) {
	const session: SessionInternal = {
		id: randomUUID(),
		userId,
		token: randomBytes(64).toString('base64'),
		expires: elevated ? in10minutes() : in30days(),
		elevated,
		created: new Date(),
	};
	await db.insertInto('sessions').values(session).execute();
	await audit('new_session', userId, { id: session.id });
	return session;
}

export interface SessionAndUser extends SessionInternal {
	user: UserInternal;
}

export async function getSessionAndUser(token: string): Promise<SessionAndUser> {
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
	return await db
		.selectFrom('sessions')
		.selectAll()
		.where('id', '=', sessionId)
		.where('sessions.expires', '>', new Date())
		.executeTakeFirstOrThrow();
}

export async function getSessions(userId: string): Promise<SessionInternal[]> {
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
	await db.insertInto('verifications').values(verification).executeTakeFirstOrThrow();
	setTimeout(() => {
		void db.deleteFrom('verifications').where('verifications.token', '=', verification.token).execute();
	}, expires * 1000);
	return verification;
}

export async function useVerification(role: VerificationRole, userId: string, token: string): Promise<VerificationInternal | undefined> {
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
	return await db.selectFrom('passkeys').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

export async function createPasskey(passkey: Omit<PasskeyInternal, 'createdAt'>): Promise<PasskeyInternal> {
	const result = await db.insertInto('passkeys').values(passkey).returningAll().executeTakeFirstOrThrow();
	return result;
}

export async function getPasskeysByUserId(userId: string): Promise<PasskeyInternal[]> {
	return await db.selectFrom('passkeys').selectAll().where('userId', '=', userId).execute();
}

export async function updatePasskeyCounter(id: PasskeyInternal['id'], newCounter: PasskeyInternal['counter']): Promise<PasskeyInternal> {
	await db.updateTable('passkeys').set({ counter: newCounter }).where('id', '=', id).executeTakeFirstOrThrow();
	const passkey = await getPasskey(id);
	if (!passkey) throw new Error('Passkey not found');
	return passkey;
}

export interface UserAuthResult extends SessionAndUser {
	/** The user authenticating the request. */
	accessor: UserInternal;
}

export async function checkAuthForUser(event: RequestEvent, userId: string, sensitive: boolean = false): Promise<UserAuthResult> {
	const token = getToken(event, sensitive);

	if (!token) throw error(401, 'Missing token');

	const session = await getSessionAndUser(token).catch(withError('Invalid or expired session', 401));

	if (session.user.isSuspended) error(403, 'User is suspended');

	if (session.userId !== userId) {
		if (!session.user?.isAdmin) error(403, 'User ID mismatch');

		// Admins are allowed to manage other users.
		const accessor = session.user;
		session.user = await getUser(userId).catch(withError('Target user not found', 404));

		return Object.assign(session, { accessor });
	}

	if (!session.elevated && sensitive) error(403, 'This token can not be used for sensitive actions');

	return Object.assign(session, { accessor: session.user });
}

export interface ItemAuthResult<T extends acl.Target> {
	fromACL: boolean;
	item: T;
	user?: UserInternal;
	session?: SessionInternal;
}

export async function checkAuthForItem<const V extends acl.Target>(
	event: RequestEvent,
	itemType: acl.TargetName,
	itemId: string,
	permission: Permission
) {
	const token = getToken(event, false);
	if (!token) error(401, 'Missing token');

	const session = await getSessionAndUser(token).catch(() => null);

	const item: V & { acl?: AccessControl[] } = await db
		.selectFrom(itemType)
		.selectAll()
		.where('id', '=', itemId)
		.$if(!!session, eb => eb.select(acl.from(itemType, { onlyId: session!.userId })))
		.$castTo<V & { acl?: AccessControl[] }>()
		.executeTakeFirstOrThrow()
		.catch(withError('Item not found', 404));

	const result: ItemAuthResult<V> = {
		session: session ? omit(session, 'user') : undefined,
		item: omit(item, 'acl') as any as V,
		user: session?.user,
		fromACL: false,
	};

	if (item.publicPermission >= permission) return result;

	if (!session) error(403, 'Access denied');
	if (session.user.isSuspended) error(403, 'User is suspended');

	if (session.userId == item.userId) return result;

	result.fromACL = true;

	if (!item.acl || !item.acl.length) error(403, 'Access denied');

	const [control] = item.acl;
	if (control.userId !== session.userId) {
		await audit('acl_id_mismatch', session.userId, { item: itemId });
		error(500, 'Access control entry does not match session user');
	}

	if (control.permission >= permission) return result;

	error(403, 'Access denied');
}
