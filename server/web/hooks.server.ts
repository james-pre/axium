import { loadDefaultConfigs } from '@axium/server/config';
import { _markDefaults } from '@axium/server/routes';
import './api/index.js';

_markDefaults();
await loadDefaultConfigs();
