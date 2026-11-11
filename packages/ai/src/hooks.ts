import { count } from '@axium/server/database';
import './common.js';
import './server/api.js';
import { failInterrupted } from './server/generation.js';

export async function load() {
	await failInterrupted();
}

export async function statusText(): Promise<string> {
	const { ai_conversations, ai_messages } = await count('ai_conversations', 'ai_messages');

	return `${ai_conversations} conversations, ${ai_messages} messages`;
}
