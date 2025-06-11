/** Register a new passkey for a new or existing user. */
import { getPasskey, getPasskeysByUserId, getUser } from '@axium/server/auth.js';
import { config } from '@axium/server/config.js';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { error, type RequestEvent } from '@sveltejs/kit';
import { pick } from 'utilium';
import z from 'zod/v4';
import { authenticatorAttachment } from '../schemas.js';
import { checkAuth, createSessionResponse, parseBody } from '../utils.js';

const challenges = new Map<string, string>();

export async function OPTIONS(event: RequestEvent): Promise<Response> {
	const { userId } = await parseBody(event, z.object({ userId: z.uuid() }));

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

	return new Response(JSON.stringify({ userId, options }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

const schema = z.object({
	userId: z.uuid(),
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

export async function POST(event: RequestEvent): Promise<Response> {
	const { userId, response } = await parseBody(event, schema);

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

	return await createSessionResponse(event, userId);
}
