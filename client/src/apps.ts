import type { AppPreferences } from '@axium/core';
import { appPreferences } from '@axium/core';
import * as cache from './cache.js';
import { fetchAPI } from './requests.js';

export async function getAppPreferences<A extends string>(userId: string, appId: A): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const pref = await cache.use('app_preferences', userId + ':' + appId, async () => {
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
	cache.update('app_preferences', userId + ':' + appId, result);
	return schema.parse(result) as AppPreferences<A>;
}

export async function clearAppPreferences<A extends string>(userId: string, appId: A): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const result = await fetchAPI('DELETE', 'users/:id/preferences/:appId', {}, userId, appId);
	cache.invalidate('app_preferences', userId + ':' + appId);
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
