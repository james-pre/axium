import config from '@axium/server/vite.config.js';

config.ssr.external.push('@axium/tasks/server', '@axium/tasks/plugin');
config.optimizeDeps.include.push('@axium/tasks/components');

export default config;
