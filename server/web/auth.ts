import { dev } from '$app/environment';
import { SvelteKitAuth } from '@auth/sveltekit';
import Passkey from '@auth/core/providers/passkey';
import { adapter } from '../src/auth';

/**
 * @todo Add DB and stuff
 */
export const { handle, signIn, signOut } = SvelteKitAuth({
	adapter: adapter({}),
	providers: [Passkey],
	debug: dev,
	experimental: { enableWebAuthn: true },
});
