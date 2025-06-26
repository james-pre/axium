/** Register a new user. */
import { createSessionResponse, parseBody } from '@axium/server/api.js';
import { createPasskey, createUser, getUser, getUserByEmail } from '@axium/server/auth.js';
import { config } from '@axium/server/config.js';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';
import { PasskeyRegistration } from '../schemas';

// Map of user ID => challenge
const registrations = new Map<string, string>();

export async function OPTIONS(event: RequestEvent): Promise<Response> {
	const { name } = await parseBody(event, z.object({ name: z.string().optional() }));

	const userId = randomUUID();
	const user = await getUser(userId);
	if (user) error(409, { message: 'Generated UUID is already in use, please retry.' });

	const options = await generateRegistrationOptions({
		rpName: config.auth.rp_name,
		rpID: config.auth.rp_id,
		userName: userId,
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

	return json({ userId, options });
}

const schema = z.object({
	name: z.string().min(1).max(100),
	email: z.email(),
	userId: z.uuid(),
	response: PasskeyRegistration,
});

export async function POST(event: RequestEvent): Promise<Response> {
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

	if (!verified) error(401, { message: 'Verification failed' });

	await createUser({ id: userId, name, email }).catch(() => error(500, { message: 'Failed to create user' }));

	await createPasskey({
		transports: [],
		...registrationInfo.credential,
		userId,
		deviceType: registrationInfo.credentialDeviceType,
		backedUp: registrationInfo.credentialBackedUp,
	}).catch(() => error(500, { message: 'Failed to create passkey' }));

	return await createSessionResponse(event, userId);
}
