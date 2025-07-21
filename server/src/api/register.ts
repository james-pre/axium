/** Register a new user. */
import type { Result } from '@axium/core/api';
import { APIUserRegistration } from '@axium/core/schemas';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error, type RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import z from 'zod';
import { createPasskey, getUser } from '../auth.js';
import config from '../config.js';
import { database as db, type Schema } from '../database.js';
import { addRoute } from '../routes.js';
import { createSessionData, parseBody, withError } from '../requests.js';

// Map of user ID => challenge
const registrations = new Map<string, string>();

async function OPTIONS(event: RequestEvent): Result<'OPTIONS', 'register'> {
	if (!config.allow_new_users) error(409, { message: 'New user registration is disabled' });

	const { name, email } = await parseBody(event, z.object({ name: z.string().optional(), email: z.email().optional() }));

	const userId = randomUUID();
	const user = await getUser(userId).catch(() => null);
	if (user) error(409, { message: 'Generated UUID is already in use, please retry.' });

	const options = await generateRegistrationOptions({
		rpName: config.auth.rp_name,
		rpID: config.auth.rp_id,
		userName: email ?? userId,
		userDisplayName: name,
		attestationType: 'none',
		excludeCredentials: [],
		authenticatorSelection: {
			residentKey: 'preferred',
			userVerification: 'preferred',
			authenticatorAttachment: 'platform',
		},
	});

	registrations.set(userId, options.challenge);

	return { userId, options };
}

async function POST(event: RequestEvent) {
	if (!config.allow_new_users) error(409, { message: 'New user registration is disabled' });

	const { userId, email, name, response } = await parseBody(event, APIUserRegistration);

	const existing = await db.selectFrom('users').selectAll().where('email', '=', email.toLowerCase()).executeTakeFirst();
	if (existing) error(409, { message: 'Email already in use' });

	const expectedChallenge = registrations.get(userId);
	if (!expectedChallenge) error(404, { message: 'No registration challenge found for this user' });
	registrations.delete(userId);

	const { verified, registrationInfo } = await verifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin: config.auth.origin,
	}).catch(() => error(400, { message: 'Verification failed' }));

	if (!verified || !registrationInfo) error(401, { message: 'Verification failed' });

	await db
		.insertInto('users')
		.values({ id: userId, name, email: email.toLowerCase() } as Schema['users'])
		.executeTakeFirstOrThrow()
		.catch(withError('Failed to create user'));

	await createPasskey({
		transports: [],
		...registrationInfo.credential,
		userId,
		deviceType: registrationInfo.credentialDeviceType,
		backedUp: registrationInfo.credentialBackedUp,
	}).catch(e => error(500, { message: 'Failed to create passkey' + (config.debug ? `: ${e.message}` : '') }));

	return await createSessionData(userId);
}

addRoute({
	path: '/api/register',
	params: {},
	OPTIONS,
	POST,
});
