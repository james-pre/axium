import { redirect } from '@sveltejs/kit';
import config from '../../../dist/config.js';

export function load() {
	if (!config.auth.credentials) return redirect(307, '/auth/signin');
}
