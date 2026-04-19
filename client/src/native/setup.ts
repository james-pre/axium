import type { Session, User } from '@axium/core';
import { Preferences } from '@capacitor/preferences';
import { setPrefix, setToken } from '../requests.js';
import { getCurrentSession } from '../user.js';

export interface LoadResult {
	session?: (Session & { user: User }) | null;
	needsSetup?: boolean;
	/** Whether we are in "register instead" */
}

export async function loadLayout(): Promise<LoadResult> {
	const { value: api_prefix } = await Preferences.get({ key: 'api_prefix' });
	const { value: api_token } = await Preferences.get({ key: 'api_token' });

	let session;

	if (api_prefix) {
		setPrefix(api_prefix);
		if (api_token) {
			setToken(api_token);
			document.cookie = 'session_token=' + api_token;
			session = await getCurrentSession().catch(() => null);
		}
	}

	return { session, needsSetup: !api_prefix || !session };
}
