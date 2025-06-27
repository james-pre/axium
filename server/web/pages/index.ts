import { addRoute } from '@axium/server/routes.js';
import account from './account.svelte';
import register from './register.svelte';
import logout from './logout.svelte';

addRoute({ path: '/account', page: account });
addRoute({ path: '/register', page: register });
addRoute({ path: '/logout', page: logout });
