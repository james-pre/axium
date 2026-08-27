import feature from '@axium/core/features';
import { errorText } from 'ioium';
import { themeStyles } from '../themes.js';
import { extendCurrentSession, getCurrentSession } from '../user.js';
import { loadFeatures } from './features.js';
import { loadLocale } from './locales.js';

const day = 86400_000;

export async function init() {
	await loadLocale().catch(() => {});
	const session = await getCurrentSession().catch(() => null);
	await loadFeatures(session?.userId).catch(() => {});

	if (session && session.expires.getTime() < Date.now() + day)
		try {
			await extendCurrentSession(session.userId);
		} catch {
			console.debug('Failed to extend current session');
		}

	if (feature('themes')) {
		const theme = themeStyles[session?.user?.preferences?.theme || 'default'] || {};
		for (const [prop, value] of Object.entries(theme)) document.documentElement.style.setProperty('--' + prop, value);
	}
}

interface SK_ErrorData {
	error: Error & { status?: number };
	event: {
		params: Record<string, unknown>;
		route: { id: string };
		url: URL;
	};
	status: number;
	message: string;
}

export function handleError({ error, status }: SK_ErrorData) {
	console.error(error);
	return { message: errorText(error), stack: error.stack, status: error.status || status };
}
