import { loadDefaultConfigs } from '@axium/server/config.js';
import { _markDefaults } from '@axium/server/routes.js';
import './api/index.js';

_markDefaults();
await loadDefaultConfigs();
