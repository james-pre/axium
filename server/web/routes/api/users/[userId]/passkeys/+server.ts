/** Register a new passkey for a new or existing user. */
import { checkAuth, parseBody } from '@axium/server/api.js';
import { createPasskey, getPasskeysByUserId, getUser } from '@axium/server/auth.js';
import { config } from '@axium/server/config.js';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import { pick } from 'utilium';
import z from 'zod/v4';
import { PasskeyRegistration } from '../../../schemas';

// Map of user ID => challenge
const registrations = new Map<string, string>();

/**
 * Get passkey registration options for a user.
 */
export async function OPTIONS(event: RequestEvent): Promise<Response> {
	const { userId } = event.params;

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

	return json({ userId, options });
}

/**
 * Get passkeys for a user.
 */
export async function GET(event: RequestEvent): Promise<Response> {
	const { userId } = event.params;

	const user = await getUser(userId);
	if (!user) error(404, { message: 'User does not exist' });

	await checkAuth(event, userId);

	const passkeys = await getPasskeysByUserId(userId);

	return json({ userId, existing: passkeys.map(p => pick(p, 'id', 'name', 'createdAt')) });
}

const schema = z.object({
	userId: z.uuid(),
	name: z.string().optional(),
	response: PasskeyRegistration,
});

/**
 * Register a new passkey for an existing user.
 */
export async function PUT(event: RequestEvent): Promise<Response> {
	const { userId } = event.params;
	const { response } = await parseBody(event, schema);

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

	if (!verified) error(401, { message: 'Verification failed' });

	await createPasskey({
		transports: [],
		...registrationInfo.credential,
		userId,
		deviceType: registrationInfo.credentialDeviceType,
		backedUp: registrationInfo.credentialBackedUp,
	}).catch(() => error(500, { message: 'Failed to create passkey' }));

	return json({ userId, verified });
}
