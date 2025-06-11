import { allLogLevels } from 'logzen';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path/posix';
import config from '../dist/config.js';
import { findDir, logger } from '../dist/io.js';

logger.attach(createWriteStream(join(findDir(false), 'server.log')), { output: allLogLevels });
await config.loadDefaults();
