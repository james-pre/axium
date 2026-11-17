import { database } from '@axium/server/database';
import * as ai from '../common.js';

/** The user's AI preferences, with defaults for anything unset or invalid */
export async function getPreferences(userId: string): Promise<ai.Preferences> {
	const row = await database
		.selectFrom('app_preferences')
		.select('data')
		.where('userId', '=', userId)
		.where('appId', '=', 'ai')
		.executeTakeFirst();

	return ai.Preferences.safeParse(row?.data ?? {}).data ?? ai.Preferences.parse({});
}
