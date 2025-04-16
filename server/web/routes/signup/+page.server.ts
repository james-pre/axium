import { redirect } from '@sveltejs/kit';
import * as config from '../../../dist/config.js';
import { signup } from '../../actions.js';
import type { Actions } from './$types.js';

export function load() {
	if (!config.auth.credentials) return redirect(307, '/auth/signin');
}

export const actions = { default: signup } satisfies Actions;
