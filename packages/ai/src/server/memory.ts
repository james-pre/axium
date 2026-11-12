import { database } from '@axium/server/database';
import type * as ai from '../common.js';

export async function getMemories(userId: string): Promise<ai.Memory[]> {
	return await database.selectFrom('ai_memories').selectAll().where('userId', '=', userId).orderBy('id').$castTo<ai.Memory>().execute();
}
