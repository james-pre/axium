import { themeStyles } from '@axium/client/themes';
import { getCurrentSession } from '@axium/client/user';
import { loadFeatures } from '@axium/client/web/features';
import { loadLocale } from '@axium/client/web/locales';
import feature from '@axium/core/features';
import { errorText } from 'ioium';

export async function init() {
	await loadLocale().catch(() => {});
	const session = await getCurrentSession().catch(() => null);
	await loadFeatures(session?.user?.id).catch(() => {});

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
