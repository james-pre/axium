import { dev } from '$app/environment';
import Passkey from '@auth/core/providers/passkey';
import type { Database, KyselyAuth } from '@auth/kysely-adapter';
import { KyselyAdapter } from '@auth/kysely-adapter';
import { SvelteKitAuth } from '@auth/sveltekit';
import * as zod from 'zod';
import { database } from '../server/database.js';

export const credentialsAuthSchema = zod.object({
	email: zod.string({ required_error: 'Email is required' }).min(1, 'Email is required').email('Invalid email'),
	password: zod
		.string({ required_error: 'Password is required' })
		.min(1, 'Password is required')
		.min(4, 'Password must be more than 4 characters')
		.max(32, 'Password must be less than 32 characters'),
});

const adapter = KyselyAdapter(database as any as KyselyAuth<Database>);

/**
 * @todo Add DB and stuff
 */
export const { handle, signIn, signOut } = SvelteKitAuth({
	adapter,
	providers: [
		Passkey,
		/* Credentials({
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				const { email, password } = await credentialsAuthSchema.parseAsync(credentials).catch(() => ({ email: null, password: null }));

				if (!email || !password) return null;

				const user = await adapter.getUserByEmail!(email);

				if (!user) return null;

				if (!(user.password === hash(password))) return null;

				return user;
			},
		}), */
	],
	debug: dev,
	experimental: { enableWebAuthn: true },
});
