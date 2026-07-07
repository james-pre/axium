import { count } from '@axium/server/database';
import '../common.js';
import './api.js';
import { startOutbound } from './send.js';
import { startInbound } from './smtp.js';

export async function statusText(): Promise<string> {
	const { emails } = await count('emails');

	return `${emails} emails`;
}

export function load(): void {
	startInbound();
	startOutbound();
}
