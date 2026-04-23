import { appPreferences } from '@axium/core';
import { fetchAPI } from './requests.js';
import type { AppPreferences } from '@axium/core';
import { useCache } from './cache.js';

export async function getAppPreferences<A extends string>(userId: string, appId: A): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const pref = await useCache('app_preferences', userId + ':' + appId, async () => {
		const result = await fetchAPI('GET', 'users/:id/preferences/:appId', {}, userId, appId);
		return schema.parse(result);
	});
	return pref as AppPreferences<A>;
}

export async function setAppPreferences<A extends string>(
	userId: string,
	appId: A,
	preferences: AppPreferences<A>
): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const result = await fetchAPI('POST', 'users/:id/preferences/:appId', preferences, userId, appId);
	return schema.parse(result) as AppPreferences<A>;
}

export async function clearAppPreferences<A extends string>(userId: string, appId: A): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const result = await fetchAPI('DELETE', 'users/:id/preferences/:appId', {}, userId, appId);
	return schema.parse(result) as AppPreferences<A>;
}

export async function appPref<A extends string, K extends keyof AppPreferences<A>>(
	userId: string,
	appId: A,
	key: K
): Promise<AppPreferences<A>[K]> {
	const pref = await getAppPreferences(userId, appId);
	return pref[key as keyof typeof pref] as AppPreferences<A>[K];
}
