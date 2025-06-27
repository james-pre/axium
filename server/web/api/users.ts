/** Register a new passkey for a new or existing user. */
import type { Result } from '@axium/core/api';
import { PasskeyAuthenticationResponse } from '@axium/core/schemas';
import { createPasskey, getPasskey, getPasskeysByUserId, getSession, getSessions, getUser } from '@axium/server/auth.js';
import { config } from '@axium/server/config.js';
import { connect, database as db } from '@axium/server/database.js';
import { addRoute } from '@axium/server/routes.js';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error, type RequestEvent } from '@sveltejs/kit';
import { omit, pick } from 'utilium';
import z from 'zod/v4';
import { PasskeyRegistration } from './schemas.js';
import { checkAuth, createSessionResponse as createSessionData, parseBody, stripUser } from './utils.js';

const challenges = new Map<string, string>();

const params = { id: z.uuid() };

/**
 * Resolve a user's UUID using their email (in the future this might also include handles)
 */
addRoute({
	path: '/api/user_id',
	async POST(event): Promise<Result<'POST', 'user_id'>> {
		const { value } = await parseBody(event, z.object({ using: z.union([z.literal('email')]), value: z.email() }));

		connect();
		const { id } = await db.selectFrom('users').select('id').where('email', '=', value).executeTakeFirst();
		return { id };
	},
});

addRoute({
	path: '/api/users/:id',
	params,
	async GET(event): Promise<Result<'GET', 'users/:id'>> {
		const { id: userId } = event.params;

		const authed = await checkAuth(event, userId)
			.then(() => true)
			.catch(() => false);

		return stripUser(await getUser(userId), authed);
	},
});

addRoute({
	path: '/api/users/:id/full',
	params,
	async GET(event): Promise<Result<'GET', 'users/:id/full'>> {
		const { id: userId } = event.params;

		await checkAuth(event, userId);

		const user = stripUser(await getUser(userId), true);

		const sessions = await getSessions(userId);

		return {
			...user,
			sessions: sessions.map(s => omit(s, 'token')),
		};
	},
});

addRoute({
	path: '/api/users/:id/login',
	params,
	async OPTIONS(event): Promise<Result<'OPTIONS', 'users/:id/login'>> {
		const { id: userId } = event.params;

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const passkeys = await getPasskeysByUserId(userId);

		if (!passkeys) error(409, { message: 'No passkeys exists for this user' });

		const options = await generateAuthenticationOptions({
			rpID: config.auth.rp_id,
			allowCredentials: passkeys.map(passkey => pick(passkey, 'id', 'transports')),
		});

		challenges.set(userId, options.challenge);

		return options;
	},
	async POST(event: RequestEvent): Promise<Result<'POST', 'users/:id/login'>> {
		const { id: userId } = event.params;
		const response = await parseBody(event, PasskeyAuthenticationResponse);

		const expectedChallenge = challenges.get(userId);
		if (!expectedChallenge) error(404, { message: 'No challenge found for this user' });
		challenges.delete(userId);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const passkey = await getPasskey(response.id);
		if (!passkey) error(404, { message: 'Passkey does not exist' });

		if (passkey.userId !== userId) error(403, { message: 'Passkey does not belong to this user' });

		const { verified } = await verifyAuthenticationResponse({
			response,
			credential: passkey,
			expectedChallenge,
			expectedOrigin: config.auth.origin,
			expectedRPID: config.auth.rp_id,
		}).catch(() => error(400, { message: 'Verification failed' }));

		if (!verified) error(401, { message: 'Verification failed' });

		return await createSessionData(event, userId);
	},
});

// Map of user ID => challenge
const registrations = new Map<string, string>();

addRoute({
	path: '/api/users/:id/passkeys',
	params,
	/**
	 * Get passkey registration options for a user.
	 */
	async OPTIONS(event: RequestEvent) {
		const { id: userId } = event.params;

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const existing = await getPasskeysByUserId(userId);

		await checkAuth(event, userId);

		const options = await generateRegistrationOptions({
			rpName: config.auth.rp_name,
			rpID: config.auth.rp_id,
			userName: userId,
			userDisplayName: user.name,
			attestationType: 'none',
			excludeCredentials: existing.map(passkey => pick(passkey, 'id', 'transports')),
			authenticatorSelection: {
				residentKey: 'preferred',
				userVerification: 'preferred',
				authenticatorAttachment: 'platform',
			},
		});

		registrations.set(userId, options.challenge);

		return { userId, options };
	},

	/**
	 * Get passkeys for a user.
	 */
	async GET(event: RequestEvent) {
		const { id: userId } = event.params;

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		await checkAuth(event, userId);

		const passkeys = await getPasskeysByUserId(userId);

		return { userId, existing: passkeys.map(p => pick(p, 'id', 'name', 'createdAt')) };
	},

	/**
	 * Register a new passkey for an existing user.
	 */
	async PUT(event: RequestEvent) {
		const { id: userId } = event.params;
		const { response } = await parseBody(event, z.object({ userId: z.uuid(), name: z.string().optional(), response: PasskeyRegistration }));

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		await checkAuth(event, userId);

		const expectedChallenge = registrations.get(userId);
		if (!expectedChallenge) error(404, { message: 'No registration challenge found for this user' });
		registrations.delete(userId);

		const { verified, registrationInfo } = await verifyRegistrationResponse({
			response,
			expectedChallenge,
			expectedOrigin: config.auth.origin,
		}).catch(() => error(400, { message: 'Verification failed' }));

		if (!verified || !registrationInfo) error(401, { message: 'Verification failed' });

		await createPasskey({
			transports: [],
			...registrationInfo.credential,
			userId,
			deviceType: registrationInfo.credentialDeviceType,
			backedUp: registrationInfo.credentialBackedUp,
		}).catch(() => error(500, { message: 'Failed to create passkey' }));

		return { userId, verified };
	},
});

addRoute({
	path: '/api/users/:id/sessions',
	params,
	async GET(event): Promise<Result<'POST', 'users/:id/sessions'>> {
		const { id: userId } = event.params;

		await checkAuth(event, userId);

		return (await getSessions(userId).catch(e => error(503, 'Failed to get sessions' + (config.debug ? ': ' + e : '')))).map(s => pick(s, 'id', 'expires'));
	},
	async DELETE(event: RequestEvent): Promise<Result<'DELETE', 'users/:id/sessions'>> {
		const { id: userId } = event.params;
		const { id: sessionId } = await parseBody(event, z.object({ id: z.uuid() }));

		await checkAuth(event, userId);

		const session = await getSession(sessionId).catch(() => error(404, { message: 'Invalid session' }));

		if (session.userId !== userId) error(403, { message: 'Session does not belong to the user' });

		await db
			.deleteFrom('sessions')
			.where('sessions.id', '=', session.id)
			.executeTakeFirstOrThrow()
			.catch(() => error(500, { message: 'Failed to delete session' }));

		return;
	},
});
