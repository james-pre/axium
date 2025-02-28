import type { Database, KyselyAuth } from '@auth/kysely-adapter';
import { KyselyAdapter } from '@auth/kysely-adapter';
import { SvelteKitAuth } from '@auth/sveltekit';
import Credentials from '@auth/core/providers/credentials';
import Passkey from '@auth/core/providers/passkey';
import { createHash } from 'node:crypto';
import * as zod from 'zod';
import { db } from '../server/database';
import { dev } from '$app/environment';

export const credentialsAuthSchema = zod.object({
	email: zod.string({ required_error: 'Email is required' }).min(1, 'Email is required').email('Invalid email'),
	password: zod
		.string({ required_error: 'Password is required' })
		.min(1, 'Password is required')
		.min(8, 'Password must be more than 8 characters')
		.max(32, 'Password must be less than 32 characters'),
});

function hash(password: string) {
	return createHash('sha512').update(password).digest('hex');
}

const adapter = KyselyAdapter(db as any as KyselyAuth<Database>);

/**
 * @todo Add DB and stuff
 */
export const { handle, signIn, signOut } = SvelteKitAuth({
	adapter,
	providers: [
		//Passkey,
		Credentials({
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				const { email, password } = credentialsAuthSchema.parse(credentials);

				const user = await adapter.getUserByEmail!(email);

				if (!user) return null;

				if (!(user.password === hash(password))) return null;

				return user;
			},
		}),
	],
	debug: dev,
	experimental: { enableWebAuthn: true },
});
