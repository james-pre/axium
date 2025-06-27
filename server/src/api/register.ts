/** Register a new user. */
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error, type RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';
import { createPasskey, createUser, getUser, getUserByEmail } from '../auth.js';
import { config } from '../config.js';
import { addRoute } from '../routes.js';
import { PasskeyRegistration } from './schemas.js';
import { createSessionResponse, parseBody } from './utils.js';

// Map of user ID => challenge
const registrations = new Map<string, string>();

async function OPTIONS(event: RequestEvent) {
	const { name, email } = await parseBody(event, z.object({ name: z.string().optional(), email: z.email().optional() }));

	const userId = randomUUID();
	const user = await getUser(userId);
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

const schema = z.object({
	name: z.string().min(1).max(100),
	email: z.email(),
	userId: z.uuid(),
	response: PasskeyRegistration,
});

async function POST(event: RequestEvent) {
	const { userId, email, name, response } = await parseBody(event, schema);

	const existing = await getUserByEmail(email);
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

	await createUser({ id: userId, name, email }).catch(() => error(500, { message: 'Failed to create user' }));

	await createPasskey({
		transports: [],
		...registrationInfo.credential,
		userId,
		deviceType: registrationInfo.credentialDeviceType,
		backedUp: registrationInfo.credentialBackedUp,
	}).catch(e => error(500, { message: 'Failed to create passkey' + (config.debug ? `: ${e.message}` : '') }));

	return await createSessionResponse(event, userId);
}

addRoute({
	path: '/api/register',
	params: {},
	OPTIONS,
	POST,
});
