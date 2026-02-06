import type { Passkey, Session, UserInternal, VerificationInternal, VerificationRole } from '@axium/core';
import type { Insertable, Kysely, Selectable } from 'kysely';
import { randomBytes, randomUUID } from 'node:crypto';
import { omit, type WithRequired } from 'utilium';
import * as acl from './acl.js';
import { audit } from './audit.js';
import { database as db, userFromId, type Schema } from './database.js';
import { error, getToken, withError } from './requests.js';

export async function getUser(id: string): Promise<UserInternal> {
	return await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

export async function updateUser({ id, ...user }: WithRequired<Insertable<Schema['users']>, 'id'>): Promise<UserInternal> {
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

export async function requireSession(request: Request, sensitive: boolean = false): Promise<SessionAndUser> {
	const token = getToken(request, sensitive);

	if (!token) error(401, 'Missing session token');

	const session = await getSessionAndUser(token).catch(withError('Invalid or expired session token', 401));

	if (session.user.isSuspended) error(403, 'User is suspended');

	return session;
}

export async function getSessions(userId: string): Promise<SessionInternal[]> {
	return await db.selectFrom('sessions').selectAll().where('userId', '=', userId).where('sessions.expires', '>', new Date()).execute();
}

/**
 * Create a verification
 * @param expires How long the token should be valid for in minutes
 */
export async function createVerification(
	this: Kysely<Schema> | void,
	role: VerificationRole,
	userId: string,
	expires: number
): Promise<VerificationInternal> {
	const token = randomBytes(64).toString('base64url');
	const verification: VerificationInternal = { userId, token, expires: new Date(Date.now() + expires * 60_000), role };
	await (this || db).insertInto('verifications').values(verification).executeTakeFirstOrThrow();
	setTimeout(() => {
		void db.deleteFrom('verifications').where('verifications.token', '=', verification.token).execute();
	}, expires * 60_000);
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
	publicKey: Uint8Array<ArrayBuffer>;
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

export async function checkAuthForUser(request: Request, userId: string, sensitive: boolean = false): Promise<UserAuthResult> {
	const session = await requireSession(request);

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

export interface ItemAuthResult<TB extends acl.TargetName> {
	fromACL: boolean;
	item: Selectable<Schema[TB]>;
	user?: UserInternal;
	session?: SessionInternal;
}

export async function authSessionForItem<const TB extends acl.TargetName>(
	itemType: TB,
	itemId: string,
	permissions: Partial<acl.PermissionsFor<`acl.${TB}`>>,
	session?: SessionAndUser | null
): Promise<ItemAuthResult<TB>> {
	const { userId, user } = session ?? {};

	// Note: we need to do casting because of TS limitations with generics
	const item = await db
		.selectFrom(itemType as acl.TableName)
		.selectAll()
		.where('id', '=', itemId)
		.$if(!!userId, eb => eb.select(acl.from(itemType, { user })))
		.$castTo<acl.WithACL<TB>>()
		.executeTakeFirstOrThrow()
		.catch(e => {
			if (e.message.includes('no rows')) error(404, itemType + ' not found');
			throw e;
		});

	const result: ItemAuthResult<TB> = {
		session: session ? omit(session, 'user') : undefined,
		item: omit(item, 'acl') as any,
		user,
		fromACL: false,
	};

	if (!session || !user) error(403, 'Access denied');
	if (user.isSuspended) error(403, 'User is suspended');

	if (userId == item.userId) return result;

	result.fromACL = true;

	if (!item.acl || !item.acl.length) error(403, 'Access denied');

	if (acl.check(item.acl, permissions).size) error(403, 'Access denied');

	return result;
}

/**
 * Authenticate a request against an "item" which has an ACL table.
 * This will fetch the item, ACLs, users, and the authenticating session.
 */
export async function authRequestForItem<const TB extends acl.TargetName>(
	request: Request,
	itemType: TB,
	itemId: string,
	permissions: Partial<acl.PermissionsFor<`acl.${TB}`>>
): Promise<ItemAuthResult<TB>> {
	const token = getToken(request, false);
	if (!token) error(401, 'Missing token');

	const session = await getSessionAndUser(token).catch(() => null);

	return await authSessionForItem(itemType, itemId, permissions, session);
}
