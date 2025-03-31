import { SvelteKitAuth } from '@auth/sveltekit';
import * as auth from '../src/auth.js';

export const { handle, signIn, signOut } = SvelteKitAuth(auth.getConfig());
