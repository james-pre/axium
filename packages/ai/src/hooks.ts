import { count } from '@axium/server/database';
import * as io from 'ioium';
import './common.js';
import './server/api/conversations.js';
import './server/api/gateway.js';
import './server/api/temporary.js';
import { failInterrupted } from './server/generation.js';
import * as llama from './server/llama.js';
import './server/api/models.js';
import { syncPreset } from './server/models.js';

export async function load() {
	await failInterrupted();
	await syncPreset();
	await llama.start();
}

export async function configChanged() {
	if (llama.settingsChanged()) {
		io.info('AI: restarting llama-server with the new settings');
		await llama.stop();
		await syncPreset();
		await llama.start();
		return;
	}

	await syncPreset();
}

export async function statusText(): Promise<string> {
	const { ai_models, ai_conversations, ai_messages } = await count('ai_models', 'ai_conversations', 'ai_messages');

	return `${ai_models} models, ${ai_conversations} conversations, ${ai_messages} messages`;
}
