import type { AppPreferences } from '@axium/core';
import { appPreferences } from '@axium/core';
import Cache from './cache.js';
import { fetchAPI } from './requests.js';

const cache = new Cache<[string, string], object>(async (userId: string, appId: string): Promise<object> => {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const result = await fetchAPI('GET', 'users/:id/preferences/:appId', {}, userId, appId);
	return schema.parse(result);
});

export async function get<A extends string>(userId: string, appId: A): Promise<AppPreferences<A>> {
	return (await cache.get(userId, appId)) as AppPreferences<A>;
}

export async function set<A extends string>(userId: string, appId: A, preferences: AppPreferences<A>): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const result = await fetchAPI('POST', 'users/:id/preferences/:appId', preferences, userId, appId);
	cache.set(userId, appId, result);
	return schema.parse(result) as AppPreferences<A>;
}

export async function clear<A extends string>(userId: string, appId: A): Promise<AppPreferences<A>> {
	const schema = appPreferences.get(appId);
	if (!schema) throw new Error(`Missing schema for "${appId}"`);
	const result = await fetchAPI('DELETE', 'users/:id/preferences/:appId', {}, userId, appId);
	cache.invalidate(userId, appId);
	return schema.parse(result) as AppPreferences<A>;
}

export async function appPref<A extends string, K extends keyof AppPreferences<A>>(
	userId: string,
	appId: A,
	key: K
): Promise<AppPreferences<A>[K]> {
	const pref = await get(userId, appId);
	return pref[key as keyof typeof pref] as AppPreferences<A>[K];
}
