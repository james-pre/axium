/** Register a new passkey for a new or existing user. */
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error, type RequestEvent } from '@sveltejs/kit';
import { pick } from 'utilium';
import z from 'zod/v4';
import { createPasskey, getPasskey, getPasskeysByUserId, getUser } from '../auth.js';
import { config } from '../config.js';
import { connect, database as db } from '../database.js';
import { addRoute } from '../routes.js';
import { authenticatorAttachment, PasskeyRegistration } from './schemas.js';
import { checkAuth, createSessionResponse as createSessionData, parseBody } from './utils.js';

const challenges = new Map<string, string>();

const params = {
	id: z.uuid(),
};

const loginPostSchema = z.object({
	response: z.object({
		id: z.string(),
		rawId: z.string(),
		response: z.object({
			clientDataJSON: z.string(),
			authenticatorData: z.string(),
			signature: z.string(),
			userHandle: z.string().optional(),
		}),
		authenticatorAttachment,
		clientExtensionResults: z.record(z.any(), z.any()),
		type: z.literal('public-key'),
	}),
});

addRoute({
	path: '/api/users/:id/login',
	params,
	async OPTIONS(event) {
		const userId = event.params.id!;

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const passkeys = await getPasskeysByUserId(userId);

		if (!passkeys) error(409, { message: 'No passkeys exists for this user' });

		if (userId) await checkAuth(event, userId);

		const options = await generateAuthenticationOptions({
			rpID: config.auth.rp_id,
			allowCredentials: passkeys.map(passkey => pick(passkey, 'id', 'transports')),
		});

		challenges.set(userId, options.challenge);

		return { userId, options };
	},
	async POST(event: RequestEvent) {
		const userId = event.params.id!;
		const { response } = await parseBody(event, loginPostSchema);

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		const passkey = await getPasskey(response.id);
		if (!passkey) error(404, { message: 'Passkey does not exist' });
		if (passkey.userId !== userId) error(403, { message: 'Passkey does not belong to this user' });

		const expectedChallenge = challenges.get(userId);
		if (!expectedChallenge) error(404, { message: 'No challenge found for this user' });
		challenges.delete(userId);

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

addRoute({
	path: '/api/users/:id/logout',
	params,
	async POST(event: RequestEvent) {
		const userId = event.params.id!;
		const { sessionId } = await parseBody(event, z.object({ sessionId: z.uuid() }));

		const user = await getUser(userId);
		if (!user) error(404, { message: 'User does not exist' });

		await checkAuth(event, userId);

		connect();

		const session = await db
			.selectFrom('sessions')
			.selectAll()
			.where('id', '=', sessionId)
			.executeTakeFirstOrThrow()
			.catch(() => error(404, { message: 'Invalid session' }));

		if (session.userId !== userId) error(403, { message: 'Session does not belong to the user' });

		await db
			.deleteFrom('sessions')
			.where('sessions.id', '=', session.id)
			.executeTakeFirstOrThrow()
			.catch(() => error(500, { message: 'Failed to delete session' }));

		return { userId };
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
		const userId = event.params.id!;

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
		const userId = event.params.id!;

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
		const userId = event.params.id!;
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
