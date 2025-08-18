import config from '@axium/server/vite.config.js';

config.ssr.external.push('@axium/notes/server', '@axium/notes/plugin');
config.optimizeDeps.include.push('@axium/notes/components');

export default config;
