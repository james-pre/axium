import config from '@axium/server/vite.config.js';

config.ssr.external.push('@axium/calendar/server');
config.optimizeDeps.include.push('@axium/calendar/components');

export default config;
