import { count } from '@axium/server/database';
import './common.js';
import './server.js';

export async function statusText(): Promise<string> {
	const { calendars, events } = await count('calendars', 'events');

	return `${calendars} calendars containing ${events} events`;
}
