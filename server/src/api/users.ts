/** Register a new passkey for a new or existing user. */
import type { Result } from '@axium/core/api';
import { LogoutSessions, PasskeyAuthenticationResponse, PasskeyRegistration, UserAuthOptions } from '@axium/core/schemas';
import { UserChangeable, type User } from '@axium/core/user';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { omit, pick } from 'utilium';
import z from 'zod/v4';
import {
	createPasskey,
	createVerification,
	getPasskey,
	getPasskeysByUserId,
	getSessions,
	getUser,
	useVerification,
	type SessionAndUser,
} from '../auth.js';
import { config } from '../config.js';
import { connect, database as db } from '../database.js';
import { checkAuth, createSessionData, error, parseBody, stripUser, withError } from '../requests.js';
import { addRoute } from '../routes.js';

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
		const { id } = await db
			.selectFrom('users')
			.select('id')
			.where('email', '=', value)
			.executeTakeFirstOrThrow()
			.catch(withError('User not found', 404));
		return { id };
	},
});

addRoute({
	path: '/api/users/:id',
	params,
	async GET(event): Result<'GET', 'users/:id'> {
		const userId = event.params.id!;

		const authed: SessionAndUser | null = await checkAuth(event, userId).catch(() => null);

		const user = authed?.user || (await getUser(userId).catch(withError('User does not exist', 404)));

		return stripUser(user, !!authed);
	},
	async PATCH(event): Result<'PATCH', 'users/:id'> {
		const userId = event.params.id!;
		const body: UserChangeable & Pick<User, 'emailVerified'> = await parseBody(event, UserChangeable);

		await checkAuth(event, userId);

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
		const userId = event.params.id!;

		await checkAuth(event, userId, true);

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
		const userId = event.params.id!;

		const { user } = await checkAuth(event, userId);
		const sessions = await getSessions(userId);

		return {
			...stripUser(user, true),
			sessions: sessions.map(s => omit(s, 'token')),
		};
	},
});

addRoute({
	path: '/api/users/:id/auth',
	params,
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/auth'> {
		const userId = event.params.id!;
		const { type } = await parseBody(event, UserAuthOptions);

		await getUser(userId).catch(withError('User does not exist', 404));

		const passkeys = await getPasskeysByUserId(userId);

		if (!passkeys) error(409, { message: 'No passkeys exists for this user' });

		const options = await generateAuthenticationOptions({
			rpID: config.auth.rp_id,
			allowCredentials: passkeys.map(passkey => pick(passkey, 'id', 'transports')),
		});

		challenges.set(userId, { data: options.challenge, type });

		return options;
	},
	async POST(event): Result<'POST', 'users/:id/auth'> {
		const userId = event.params.id!;
		const response = await parseBody(event, PasskeyAuthenticationResponse);

		const auth = challenges.get(userId);
		if (!auth) error(404, { message: 'No challenge' });
		const { data: expectedChallenge, type } = auth;
		challenges.delete(userId);

		const passkey = await getPasskey(response.id).catch(withError('Passkey does not exist', 404));

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
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/passkeys'> {
		const userId = event.params.id!;

		const existing = await getPasskeysByUserId(userId);

		const { user } = await checkAuth(event, userId);

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
	async GET(event): Result<'GET', 'users/:id/passkeys'> {
		const userId = event.params.id!;

		await checkAuth(event, userId);

		const passkeys = await getPasskeysByUserId(userId);

		return passkeys.map(p => omit(p, 'publicKey', 'counter'));
	},

	/**
	 * Register a new passkey for an existing user.
	 */
	async PUT(event): Result<'PUT', 'users/:id/passkeys'> {
		const userId = event.params.id!;
		const response = await parseBody(event, PasskeyRegistration);

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
		const userId = event.params.id!;

		await checkAuth(event, userId);

		return (await getSessions(userId).catch(e => error(503, 'Failed to get sessions' + (config.debug ? ': ' + e : '')))).map(s =>
			omit(s, 'token')
		);
	},
	async DELETE(event): Result<'DELETE', 'users/:id/sessions'> {
		const userId = event.params.id!;
		const body = await parseBody(event, LogoutSessions);

		await checkAuth(event, userId, body.confirm_all);

		if (!body.confirm_all && !Array.isArray(body.id)) error(400, { message: 'Invalid request body' });
		const query = body.confirm_all ? db.deleteFrom('sessions') : db.deleteFrom('sessions').where('sessions.id', 'in', body.id!);

		const result = await query
			.where('sessions.userId', '=', userId)
			.returningAll()
			.execute()
			.catch(withError('Failed to delete one or more sessions'));

		return result.map(s => omit(s, 'token'));
	},
});

addRoute({
	path: '/api/users/:id/verify_email',
	params,
	async OPTIONS(event): Result<'OPTIONS', 'users/:id/verify_email'> {
		const userId = event.params.id!;

		if (!config.auth.email_verification) return { enabled: false };

		await checkAuth(event, userId);

		if (!config.auth.email_verification) return { enabled: false };

		return { enabled: true };
	},
	async GET(event): Result<'GET', 'users/:id/verify_email'> {
		const userId = event.params.id!;

		const { user } = await checkAuth(event, userId);

		if (user.emailVerified) error(409, { message: 'Email already verified' });

		const verification = await createVerification('verify_email', userId, config.auth.verification_timeout * 60);

		return omit(verification, 'token', 'role');
	},
	async POST(event): Result<'POST', 'users/:id/verify_email'> {
		const userId = event.params.id!;
		const { token } = await parseBody(event, z.object({ token: z.string() }));

		const { user } = await checkAuth(event, userId);

		if (user.emailVerified) error(409, { message: 'Email already verified' });

		await useVerification('verify_email', userId, token).catch(withError('Invalid or expired verification token', 400));

		return {};
	},
});
