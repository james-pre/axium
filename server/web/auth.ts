import { SvelteKitAuth } from '@auth/sveltekit';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path/posix';
import { getConfig } from '../src/auth.js';
import { loadDefaults as loadDefaultConfigs } from '../src/config.js';
import { findDir, logger } from '../src/io.js';
import { allLogLevels } from 'logzen';

logger.attach(createWriteStream(join(findDir(false), 'server.log')), { output: allLogLevels });
loadDefaultConfigs();

export const { handle, signIn, signOut } = SvelteKitAuth(getConfig());
