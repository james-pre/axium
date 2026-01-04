import { count } from '@axium/server/database';
import './common.js';
import './server.js';

export async function statusText(): Promise<string> {
	const { notes } = await count('notes');

	return `${notes} notes`;
}
