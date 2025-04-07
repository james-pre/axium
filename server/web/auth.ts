import { SvelteKitAuth } from '@auth/sveltekit';
import * as auth from '../src/auth.js';
import * as config from '../src/config.js';

config.loadDefaults();

export const { handle, signIn, signOut } = SvelteKitAuth(auth.getConfig());
