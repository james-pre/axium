import config from '@axium/server/vite.config.js';

config.ssr.external.push('@axium/contacts/server');
config.optimizeDeps.include.push('@axium/contacts/components');

export default config;
