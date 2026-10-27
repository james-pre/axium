/** Log in with a discoverable passkey, without knowing the user ahead of time. */
import type { AsyncResult } from '@axium/core/api';
import { PasskeyAuthOptions, PasskeyAuthResponse } from '@axium/core/passkeys';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getPasskey, getUser } from '../auth.js';
import config from '../config.js';
import { createSessionData, error, parseBody, withError } from '../requests.js';
import { addRoute } from '../routes.js';

const challenges = new Set<string>();

async function OPTIONS(): AsyncResult<'OPTIONS', 'login'> {
	const options = await generateAuthenticationOptions({
		rpID: config.auth.rp_id,
		userVerification: 'preferred',
	});

	challenges.add(options.challenge);
	setTimeout(() => challenges.delete(options.challenge), options.timeout ?? 60_000).unref();

	return PasskeyAuthOptions.parse(options);
}

async function POST(request: Request) {
	const response = await parseBody(request, PasskeyAuthResponse);

	const passkey = await getPasskey(response.id).catch(withError('Passkey does not exist', 404));

	const user = await getUser(passkey.userId).catch(withError('User does not exist', 404));
	if (user.isSuspended) error(403, 'User is suspended');

	const { verified } = await verifyAuthenticationResponse({
		response,
		credential: passkey,
		expectedChallenge: challenge => challenges.delete(challenge),
		expectedOrigin: config.origin,
		expectedRPID: config.auth.rp_id,
	}).catch(withError('Verification failed', 400));

	if (!verified) error(401, 'Verification failed');

	return await createSessionData(passkey.userId, request);
}

addRoute({
	path: '/api/login',
	params: {},
	OPTIONS,
	POST,
});
