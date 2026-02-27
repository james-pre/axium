/** Register a new user. */
import type { AsyncResult } from '@axium/core/api';
import { UserRegistration, UserRegistrationInit } from '@axium/core/user';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { randomUUID } from 'node:crypto';
import { encodeUUID } from 'utilium';
import { audit } from '../audit.js';
import { createPasskey, getUser } from '../auth.js';
import config from '../config.js';
import { database as db } from '../database.js';
import { createSessionData, error, parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

// Map of user ID => challenge
const registrations = new Map<string, string>();

async function OPTIONS(request: Request): AsyncResult<'OPTIONS', 'register'> {
	const { name, email } = await parseBody(request, UserRegistrationInit);

	const userId = randomUUID();
	const user = await getUser(userId).catch(() => null);
	if (user) error(409, 'Generated UUID is already in use, please retry.');

	const options = await generateRegistrationOptions({
		rpName: config.auth.rp_name,
		rpID: config.auth.rp_id,
		userID: encodeUUID(userId),
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

async function POST(request: Request) {
	if (!config.allow_new_users) error(409, 'New user registration is disabled');

	const { userId, email, name, response } = await parseBody(request, UserRegistration);

	const existing = await db.selectFrom('users').selectAll().where('email', '=', email.toLowerCase()).executeTakeFirst();
	if (existing) error(409, 'Email already in use');

	const expectedChallenge = registrations.get(userId);
	if (!expectedChallenge) error(404, 'No registration challenge found for this user');
	registrations.delete(userId);

	const { verified, registrationInfo } = await verifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin: config.origin,
	}).catch(() => error(400, 'Verification failed'));

	if (!verified || !registrationInfo) error(401, 'Verification failed');

	await db
		.insertInto('users')
		.values({ id: userId, name, email: email.toLowerCase() })
		.executeTakeFirstOrThrow()
		.catch(withError('Failed to create user'));

	await audit('user_created', userId);

	await createPasskey({
		transports: [],
		...registrationInfo.credential,
		userId,
		deviceType: registrationInfo.credentialDeviceType,
		backedUp: registrationInfo.credentialBackedUp,
	}).catch(withError('Failed to create passkey', 500));

	return await createSessionData(userId, request);
}

addRoute({
	path: '/api/register',
	params: {},
	OPTIONS,
	POST,
});
