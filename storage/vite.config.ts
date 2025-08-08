import config from '@axium/server/vite.config.js';

config.ssr.external.push('@axium/storage/server', '@axium/storage/plugin');
config.optimizeDeps.exclude.push('@axium/storage/sidebar');
config.optimizeDeps.include.push('@axium/storage/components');

export default config;
