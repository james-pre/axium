import { Preferences } from '@capacitor/preferences';
import { setPrefix } from '../requests.js';
import { getCurrentSession } from '../user.js';
import type { Session, User } from '@axium/core';

export interface LoadResult {
	session?: (Session & { user: User }) | null;
	needsSetup?: boolean;
}

export async function loadLayout(): Promise<LoadResult> {
	const { value: api_prefix } = await Preferences.get({ key: 'api_prefix' });

	let session;

	if (api_prefix) {
		setPrefix(api_prefix);
		session = await getCurrentSession().catch(() => null);
	}

	return { session, needsSetup: !api_prefix || !session };
}
