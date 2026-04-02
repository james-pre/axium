import { count } from '@axium/server/database';
import '../common.js';
import './api.js';
import './pfp.js';

export async function statusText(): Promise<string> {
	const { contacts } = await count('contacts');

	return `${contacts} contacts`;
}
