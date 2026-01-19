/** Register a new passkey for a new or existing user. */
import { preferenceDefaults, Preferences } from '@axium/core';
import type { AsyncResult } from '@axium/core/api';
import { PasskeyAuthenticationResponse, PasskeyRegistration } from '@axium/core/passkeys';
import { LogoutSessions, UserAuthOptions, UserChangeable, type User } from '@axium/core/user';
import * as webauthn from '@simplewebauthn/server';
import { encodeUUID, omit, pick, type UUID } from 'utilium';
import * as z from 'zod';
import { audit } from '../audit.js';
import {
	checkAuthForUser,
	createPasskey,
	createVerification,
	getPasskey,
	getPasskeysByUserId,
	getSessions,
	getUser,
	useVerification,
} from '../auth.js';
import { config } from '../config.js';
import { database as db } from '../database.js';
import { createSessionData, error, parseBody, stripUser, withError } from '../requests.js';
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
	async POST(request): AsyncResult<'POST', 'user_id'> {
		const { value } = await parseBody(request, z.object({ using: z.literal('email'), value: z.email() }));

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
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id'> {
		const auth = await checkAuthForUser(request, userId).catch(() => null);

		const user = auth?.user || (await getUser(userId).catch(withError('User does not exist', 404)));

		return stripUser(user, !!auth);
	},
	async PATCH(request, { id: userId }): AsyncResult<'PATCH', 'users/:id'> {
		const body: UserChangeable & Pick<User, 'emailVerified'> = await parseBody(request, UserChangeable);

		await checkAuthForUser(request, userId);

		if ('email' in body) body.emailVerified = null;
		if ('preferences' in body)
			body.preferences = Object.assign(
				structuredClone(preferenceDefaults),
				await z.object(Preferences).partial().parseAsync(body.preferences).catch(withError('Invalid preferences', 400))
			);

		const result = await db
			.updateTable('users')
			.set(body)
			.where('id', '=', userId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to update user'));

		return stripUser(result, true);
	},
	async DELETE(request, { id: userId }): AsyncResult<'DELETE', 'users/:id'> {
		await checkAuthForUser(request, userId, true);

		const result = await db
			.deleteFrom('users')
			.where('id', '=', userId)
			.returningAll()
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to delete user'));

		await audit('user_deleted', userId);

		return result;
	},
});

addRoute({
	path: '/api/users/:id/full',
	params,
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/full'> {
		const { user } = await checkAuthForUser(request, userId);
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
	async OPTIONS(request, { id: userId }): AsyncResult<'OPTIONS', 'users/:id/auth'> {
		const { type } = await parseBody(request, UserAuthOptions);

		const user = await getUser(userId).catch(withError('User does not exist', 404));

		if (user.isSuspended) error(403, 'User is suspended');

		const passkeys = await getPasskeysByUserId(userId);

		if (!passkeys) error(409, 'No passkeys exists for this user');

		const options = await webauthn.generateAuthenticationOptions({
			rpID: config.auth.rp_id,
			allowCredentials: passkeys.map(passkey => pick(passkey, 'id', 'transports')),
		});

		challenges.set(userId, { data: options.challenge, type });

		return options;
	},
	async POST(request, { id: userId }) {
		const response = await parseBody(request, PasskeyAuthenticationResponse);

		const auth = challenges.get(userId);
		if (!auth) error(404, 'No challenge');
		const { data: expectedChallenge, type } = auth;
		challenges.delete(userId);

		const passkey = await getPasskey(response.id).catch(withError('Passkey does not exist', 404));

		if (passkey.userId !== userId) error(403, 'Passkey does not belong to this user');

		const { verified } = await webauthn
			.verifyAuthenticationResponse({
				response,
				credential: passkey,
				expectedChallenge,
				expectedOrigin: config.origin,
				expectedRPID: config.auth.rp_id,
			})
			.catch(withError('Verification failed', 400));

		if (!verified) error(401, 'Verification failed');

		switch (type) {
			case 'login':
				return await createSessionData(userId);
			case 'client_login':
				/** @todo tag in DB so users can manage easier */
				return await createSessionData(userId, { noCookie: true });
			case 'action':
				if ((Date.now() - passkey.createdAt.getTime()) / 60_000 < config.auth.passkey_probation)
					error(403, 'You can not authorize sensitive actions with a newly created passkey');

				return await createSessionData(userId, { elevated: true });
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
	async OPTIONS(request, { id: userId }): AsyncResult<'OPTIONS', 'users/:id/passkeys'> {
		const existing = await getPasskeysByUserId(userId);

		const { user } = await checkAuthForUser(request, userId);

		const options = await webauthn.generateRegistrationOptions({
			rpName: config.auth.rp_name,
			rpID: config.auth.rp_id,
			userID: encodeUUID(userId as UUID),
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
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/passkeys'> {
		await checkAuthForUser(request, userId);

		const passkeys = await getPasskeysByUserId(userId);

		return passkeys.map(p => omit(p, 'publicKey', 'counter'));
	},

	/**
	 * Register a new passkey for an existing user.
	 */
	async PUT(request, { id: userId }): AsyncResult<'PUT', 'users/:id/passkeys'> {
		const response = await parseBody(request, PasskeyRegistration);

		await checkAuthForUser(request, userId);

		const expectedChallenge = registrations.get(userId);
		if (!expectedChallenge) error(404, 'No registration challenge found for this user');
		registrations.delete(userId);

		const { verified, registrationInfo } = await webauthn
			.verifyRegistrationResponse({
				response,
				expectedChallenge,
				expectedOrigin: config.origin,
			})
			.catch(withError('Verification failed', 400));

		if (!verified || !registrationInfo) error(401, 'Verification failed');

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
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/sessions'> {
		await checkAuthForUser(request, userId);

		return (await getSessions(userId).catch(e => error(503, 'Failed to get sessions' + (config.debug ? ': ' + e : '')))).map(s =>
			omit(s, 'token')
		);
	},
	async DELETE(request, { id: userId }): AsyncResult<'DELETE', 'users/:id/sessions'> {
		const body = await parseBody(request, LogoutSessions);

		await checkAuthForUser(request, userId, body.confirm_all);

		if (!body.confirm_all && !Array.isArray(body.id)) error(400, 'Invalid request body');
		const query = body.confirm_all ? db.deleteFrom('sessions') : db.deleteFrom('sessions').where('sessions.id', 'in', body.id!);

		const result = await query
			.where('sessions.userId', '=', userId)
			.returningAll()
			.execute()
			.catch(withError('Failed to delete one or more sessions'));

		await audit('logout', userId, { sessions: result.map(s => s.id) });

		return result.map(s => omit(s, 'token'));
	},
});

addRoute({
	path: '/api/users/:id/verify_email',
	params,
	async OPTIONS(request, { id: userId }): AsyncResult<'OPTIONS', 'users/:id/verify_email'> {
		if (!config.auth.email_verification) return { enabled: false };

		await checkAuthForUser(request, userId);

		if (!config.auth.email_verification) return { enabled: false };

		return { enabled: true };
	},
	async GET(request, { id: userId }): AsyncResult<'GET', 'users/:id/verify_email'> {
		const { user } = await checkAuthForUser(request, userId);

		if (user.emailVerified) error(409, 'Email already verified');

		const verification = await createVerification('verify_email', userId, config.auth.verification_timeout * 60);

		return omit(verification, 'token', 'role');
	},
	async POST(request, { id: userId }): AsyncResult<'POST', 'users/:id/verify_email'> {
		const { token } = await parseBody(request, z.object({ token: z.string() }));

		const { user } = await checkAuthForUser(request, userId);

		if (user.emailVerified) error(409, 'Email already verified');

		await useVerification('verify_email', userId, token).catch(withError('Invalid or expired verification token', 400));

		return {};
	},
});
