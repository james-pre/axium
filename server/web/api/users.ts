/** Register a new passkey for a new or existing user. */
import type { Result } from '@axium/core/api';
import { PasskeyAuthenticationResponse, UserAuthOptions } from '@axium/core/schemas';
import { UserChangeable, type User } from '@axium/core/user';
import {
	createPasskey,
	createVerification,
	getPasskey,
	getPasskeysByUserId,
	getSession,
	getSessions,
	getUser,
	useVerification,
} from '@axium/server/auth.js';
import { config } from '@axium/server/config.js';
import { connect, database as db } from '@axium/server/database.js';
import { addRoute } from '@axium/server/routes.js';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { error, type RequestEvent } from '@sveltejs/kit';
import { omit, pick } from 'utilium';
import z from 'zod/v4';
import { PasskeyRegistration } from './schemas.js';
import { checkAuth, createSessionData, parseBody, stripUser, withError } from './utils.js';

interface UserAuth {
	data: string;
	type: UserAuthOptions['type'];
}

const challenges = new Map<string, UserAuth>();

const params = { id: z.uuid() };

/**
 * Resolve a user's UUID using their email (in the future this might also include handles)
 */
addRoute({
	path: '/api/user_id',
	async POST(event): Result<'POST', 'user_id'> {
		const { value } = await parseBody(event, z.object({ using: z.literal('email'), value: z.email() }));

		connect();
		const { id } = await db.selectFrom('users').select('id').where('email', '=', value).executeTakeFirst();
		return { id };
	},
});

addRoute({
	path: '/api/users/:id',
	params,
	async GET(event): Result<'GET', 'users/:id'> {
		const { id: userId } = event.params;

		const authed = await checkAuth(event, userId)
			.then(() => true)
			.catch(() => false);

		return stripUser(await getUser(userId), authed);
	},
	async PATCH(event): Result<'PATCH', 'users/:id'> {
		const { id: userId } = event.params;
		const body: UserChangeable & Pick<User, 'emailVerified'> = await parseBody(event, UserChangeable);

		await checkAuth(event, userId);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		if ('email' in body) body.emailVerified = null;

		const result = await db
			.updateTable('users')
			.set(body)
			.where('id', '=', userId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to update user'));

		return stripUser(result, true);
	},
	async DELETE(event): Result<'DELETE', 'users/:id'> {
		const { id: userId } = event.params;

		await checkAuth(event, userId, true);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const result = await db
			.deleteFrom('users')
			.where('id', '=', userId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to delete user'));

		return result;
	},
});

addRoute({
	path: '/api/users/:id/full',
	params,
	async GET(event): Result<'GET', 'users/:id/full'> {
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
	path: '/api/users/:id/auth',
	params,
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/auth'> {
		const { id: userId } = event.params;
		const { type } = await parseBody(event, UserAuthOptions);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const passkeys = await getPasskeysByUserId(userId);

		if (!passkeys) error(409, { message: 'No passkeys exists for this user' });

		const options = await generateAuthenticationOptions({
			rpID: config.auth.rp_id,
			allowCredentials: passkeys.map(passkey => pick(passkey, 'id', 'transports')),
		});

		challenges.set(userId, { data: options.challenge, type });

		return options;
	},
	async POST(event: RequestEvent): Result<'POST', 'users/:id/auth'> {
		const { id: userId } = event.params;
		const response = await parseBody(event, PasskeyAuthenticationResponse);

		const auth = challenges.get(userId);
		if (!auth) error(404, { message: 'No challenge found for this user' });
		const { data: expectedChallenge, type } = auth;
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
		}).catch(withError('Verification failed', 400));

		if (!verified) error(401, { message: 'Verification failed' });

		switch (type) {
			case 'login':
				return await createSessionData(event, userId);
			case 'action':
				if ((Date.now() - passkey.createdAt.getTime()) / 60_000 < config.auth.passkey_probation)
					error(403, { message: 'You can not authorize sensitive actions with a newly created passkey' });

				return await createSessionData(event, userId, true);
		}
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
	async OPTIONS(event: RequestEvent): Result<'OPTIONS', 'users/:id/passkeys'> {
		const { id: userId } = event.params;

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const existing = await getPasskeysByUserId(userId);

		await checkAuth(event, userId);

		const options = await generateRegistrationOptions({
			rpName: config.auth.rp_name,
			rpID: config.auth.rp_id,
			userName: userId,
			userDisplayName: user.email,
			attestationType: 'none',
			excludeCredentials: existing.map(passkey => pick(passkey, 'id', 'transports')),
			authenticatorSelection: {
				residentKey: 'preferred',
				userVerification: 'preferred',
				authenticatorAttachment: 'platform',
			},
		});

		registrations.set(userId, options.challenge);

		return options;
	},

	/**
	 * Get passkeys for a user.
	 */
	async GET(event: RequestEvent): Result<'GET', 'users/:id/passkeys'> {
		const { id: userId } = event.params;

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		await checkAuth(event, userId);

		const passkeys = await getPasskeysByUserId(userId);

		return passkeys.map(p => omit(p, 'publicKey', 'counter'));
	},

	/**
	 * Register a new passkey for an existing user.
	 */
	async PUT(event: RequestEvent): Result<'PUT', 'users/:id/passkeys'> {
		const { id: userId } = event.params;
		const response = await parseBody(event, PasskeyRegistration);

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
		}).catch(withError('Verification failed', 400));

		if (!verified || !registrationInfo) error(401, { message: 'Verification failed' });

		const passkey = await createPasskey({
			transports: [],
			...registrationInfo.credential,
			userId,
			deviceType: registrationInfo.credentialDeviceType,
			backedUp: registrationInfo.credentialBackedUp,
		}).catch(withError('Failed to create passkey'));

		return omit(passkey, 'publicKey', 'counter');
	},
});

addRoute({
	path: '/api/users/:id/sessions',
	params,
	async GET(event): Result<'POST', 'users/:id/sessions'> {
		const { id: userId } = event.params;

		await checkAuth(event, userId);

		return (await getSessions(userId).catch(e => error(503, 'Failed to get sessions' + (config.debug ? ': ' + e : '')))).map(s =>
			pick(s, 'id', 'expires')
		);
	},
	async DELETE(event: RequestEvent): Result<'DELETE', 'users/:id/sessions'> {
		const { id: userId } = event.params;
		const { id: sessionId } = await parseBody(event, z.object({ id: z.uuid() }));

		await checkAuth(event, userId);

		const session = await getSession(sessionId).catch(withError('Session does not exist', 404));

		if (session.userId !== userId) error(403, { message: 'Session does not belong to the user' });

		await db
			.deleteFrom('sessions')
			.where('sessions.id', '=', session.id)
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to delete session'));

		return;
	},
});

addRoute({
	path: '/api/users/:id/verify_email',
	params,
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/verify_email'> {
		const { id: userId } = event.params;

		if (!config.auth.email_verification) return { enabled: false };

		await checkAuth(event, userId);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		if (!config.auth.email_verification) return { enabled: false };

		return { enabled: true };
	},
	async GET(event): Result<'GET', 'users/:id/verify_email'> {
		const { id: userId } = event.params;

		await checkAuth(event, userId);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		if (user.emailVerified) error(409, { message: 'Email already verified' });

		const verification = await createVerification('verify_email', userId, config.auth.verification_timeout * 60);

		return omit(verification, 'token', 'role');
	},
	async POST(event: RequestEvent): Result<'POST', 'users/:id/verify_email'> {
		const { id: userId } = event.params;
		const { token } = await parseBody(event, z.object({ token: z.string() }));

		await checkAuth(event, userId);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		if (user.emailVerified) error(409, { message: 'Email already verified' });

		await useVerification('verify_email', userId, token).catch(withError('Invalid or expired verification token', 400));

		return {};
	},
});
