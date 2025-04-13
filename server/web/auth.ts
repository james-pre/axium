import { SvelteKitAuth } from '@auth/sveltekit';
import { getConfig } from '../src/auth.js';
import { loadDefaults as loadDefaultConfigs } from '../src/config.js';
import { attachLogFiles } from '../src/io.js';

attachLogFiles();
loadDefaultConfigs();

export const { handle, signIn, signOut } = SvelteKitAuth(getConfig());
