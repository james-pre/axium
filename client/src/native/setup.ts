import type { Session, User } from '@axium/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorPasskey } from '@capgo/capacitor-passkey';
import { setPrefix } from '../requests.js';
import { getCurrentSession } from '../user.js';

export interface LoadResult {
	session?: (Session & { user: User }) | null;
	needsSetup?: boolean;
	/** Whether we are in "register instead" */
	isRegister: boolean;
}

export async function loadLayout({ url }: { url: URL }): Promise<LoadResult> {
	const { value: api_prefix } = await Preferences.get({ key: 'api_prefix' });

	let session;

	if (api_prefix) {
		setPrefix(api_prefix);
		session = await getCurrentSession().catch(() => null);
		const { origin } = new URL(api_prefix);
		CapacitorPasskey.shimWebAuthn({ origin });
	}

	return { session, isRegister: url.pathname == '/register', needsSetup: !api_prefix || !session };
}
