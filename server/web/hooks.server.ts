import { init } from '@axium/server/serve';
await init();

export { handleSvelteKit as handle } from '@axium/server/sveltekit';
