import { getConfig } from '@axium/core';
import features from '@axium/core/features';
import { getUser } from '@axium/server/auth';
import { callAPI } from '@axium/server/call';
import { database } from '@axium/server/database';
import * as jobs from '@axium/server/jobs';
import { io as socketServer } from '@axium/server/socket';
import * as io from 'ioium';
import { sql } from 'kysely';
import * as z from 'zod';
import * as ai from '../common.js';
import * as memory from '../memory.js';
import { chat } from '../node/chat.js';
import { resolveRole } from './models.js';
import { getPreferences } from './preferences.js';

export async function getMemories(userId: string): Promise<memory.Node[]> {
	return await database.selectFrom('ai_memories').selectAll().where('userId', '=', userId).orderBy('id').$castTo<memory.Node>().execute();
}

/** Whether the server allows periodic updates */
export function updatesEnabled(): boolean {
	return features('ai-memory') && features('ai-memory-updates');
}

/** The hour of the day updates run at, in the user's home time zone */
const updateHour = 4;

const frequencyDays = { daily: 1, weekly: 7 } as const;

/** The next time at `updateHour` that is in the future, moving forward `days` when today's has passed */
function nextUpdate(days: number, timeZone: string = 'UTC'): Date {
	const now = Temporal.Now.zonedDateTimeISO(timeZone);
	let next = now.withPlainTime({ hour: updateHour });
	if (Temporal.ZonedDateTime.compare(next, now) <= 0) next = next.add({ days });
	return new Date(next.epochMilliseconds);
}

/** Characters of conversation text an update reads at most */
const maxTranscript = 40_000;

/** Characters of a single message an update reads at most */
const maxMessage = 4000;

/** How far back the first update looks, in milliseconds */
const firstLookback = 7 * 86_400_000;

function instructions(today: string, limit: number, maxLength: number): string {
	return [
		'You maintain the long-term memory that an AI assistant keeps about its user. ' +
			"You get the current memories and the user's recent conversations with the assistant, and return the changes to make.",
		'- add: lasting things the conversations show about the user that no memory covers yet, such as preferences, facts about their life, ' +
			'people they mention or ongoing projects. Skip trivia, one-off requests and anything that only mattered in one conversation. ' +
			'Only add what the user said or clearly confirmed, not what the assistant suggested.',
		'- update: memories the conversations show are wrong or out of date, and memories that should absorb a duplicate. ' +
			'Give only the fields that change; content replaces the old content.',
		'- delete: duplicates already merged into another memory with update, and memories that are clearly no longer true, ' +
			'such as plans whose date has passed. Never delete memories written by the user.',
		`Memories have a kebab-case ID, a one-line description and optional content, usually a short Markdown list of facts written in the third person, at most ${maxLength} characters. ` +
			`There can be at most ${limit} memories. Change as little as possible; when nothing needs to change, return empty lists. Today is ${today}.`,
	].join('\n\n');
}

interface TranscriptMessage {
	conversationId: string;
	title: string;
	role: string;
	content: string;
	created: Date;
}

/** Conversations as text, oldest first, keeping the newest messages that fit */
function transcript(messages: TranscriptMessage[]): string {
	const kept: TranscriptMessage[] = [];
	let budget = maxTranscript;

	for (const message of messages) {
		const content = message.content.slice(0, maxMessage);
		if (content.length > budget) break;
		budget -= content.length;
		kept.push({ ...message, content });
	}

	const conversations = Map.groupBy(kept.reverse(), message => message.conversationId);

	return Array.from(conversations.values(), group => {
		const lines = group.map(
			({ role, content, created }) => `${role == 'user' ? 'User' : 'Assistant'} (${created.toISOString()}): ${content}`
		);
		return `<conversation title=${JSON.stringify(group[0].title)}>\n${lines.join('\n')}\n</conversation>`;
	}).join('\n\n');
}

/** Reviews the user's conversations since the last update and applies the changes the model proposes */
async function update(userId: string, signal: AbortSignal): Promise<void> {
	const started = new Date();
	const user = await getUser(userId);

	const previous = await database.selectFrom('ai_memory_updates').select('ran').where('userId', '=', userId).executeTakeFirst();
	const since = previous?.ran ?? new Date(started.getTime() - firstLookback);

	const messages = await database
		.selectFrom('ai_messages')
		.innerJoin('ai_conversations', 'ai_conversations.id', 'ai_messages.conversationId')
		.select(['ai_messages.conversationId', 'ai_conversations.title', 'ai_messages.role', 'ai_messages.content', 'ai_messages.created'])
		.where('ai_conversations.userId', '=', userId)
		.where('ai_messages.role', 'in', ['user', 'assistant'])
		.where('ai_messages.status', '=', 'done')
		.where('ai_messages.content', '!=', '')
		.where('ai_messages.created', '>', since)
		.orderBy('ai_messages.created', 'desc')
		.execute();

	const applied: memory.ChangeIds = { added: [], updated: [], deleted: [] };
	let summary: string | null = null;

	if (messages.length) {
		const model = await resolveRole('chat');
		if (!model) throw new Error('No model is available');

		const { max_memories, max_memory_length } = getConfig('@axium/ai');
		const memories = await getMemories(userId);
		const today = Temporal.Now.zonedDateTimeISO(user.preferences.time_zone ?? 'UTC')
			.toPlainDate()
			.toString();

		const current = memories.map(({ id, description, content, source }) => ({
			id,
			description,
			content: content || undefined,
			...(source == 'user' && { writtenByUser: true }),
		}));

		const result = await chat({
			model,
			reasoning: 'default',
			schema: z.toJSONSchema(memory.Changes),
			signal,
			messages: [
				{ role: 'system', content: instructions(today, max_memories, max_memory_length) },
				{
					role: 'user',
					content: `<memories>\n${JSON.stringify(current, null, 1)}\n</memories>\n\n<conversations since="${since.toISOString()}">\n${transcript(messages)}\n</conversations>`,
				},
			],
		});

		const changes = memory.Changes.parse(JSON.parse(result.content));
		summary = changes.summary;

		const userWritten = new Set(memories.filter(existing => existing.source == 'user').map(existing => existing.id));

		const attempt = async (action: string, id: string, run: () => Promise<unknown>, list: string[]) => {
			try {
				await run();
				list.push(id);
			} catch (error) {
				io.debug(`AI: memory update could not ${action} "${id}":`, io.errorText(error));
			}
		};

		for (const { id, ...changed } of changes.update) {
			if (changed.description === undefined && changed.content === undefined) continue;
			await attempt(
				'update',
				id,
				() => callAPI(user, 'PATCH', 'users/:id/ai/memories/:memory', changed, userId, id),
				applied.updated
			);
		}

		for (const id of changes.delete) {
			if (userWritten.has(id)) continue;
			await attempt('delete', id, () => callAPI(user, 'DELETE', 'users/:id/ai/memories/:memory', {}, userId, id), applied.deleted);
		}

		for (const init of changes.add) {
			await attempt(
				'add',
				init.id,
				() => callAPI(user, 'PUT', 'users/:id/ai/memories', { ...init, source: 'periodic' }, userId),
				applied.added
			);
		}
	}

	const row = { ran: started, summary, changes: JSON.stringify(applied) };
	await database
		.insertInto('ai_memory_updates')
		.values({ userId, ...row })
		.onConflict(conflict => conflict.column('userId').doUpdateSet(row))
		.execute();
}

const updates = jobs.define('ai.memory', {
	concurrency: 1,
	attempts: 3,
	backoff: 30 * 60_000,
	async run(_, { userId, signal }) {
		if (!userId) return;

		const preferences = await getPreferences(userId);
		if (!updatesEnabled() || !preferences.tools.memory) return;

		await emitStatus(userId, true);
		try {
			await update(userId, signal);
		} finally {
			await emitStatus(userId, false);
		}

		const { memory_updates } = preferences.tools;
		if (memory_updates == 'off') return;

		const user = await getUser(userId);
		return nextUpdate(frequencyDays[memory_updates], user.preferences.time_zone);
	},
});

/** Makes sure every user with updates turned on has one scheduled, and retries ones that failed */
jobs.define('ai.memory.schedule', {
	every: 3_600_000,
	async run() {
		if (!updatesEnabled()) return;

		const rows = await database
			.selectFrom('app_preferences')
			.innerJoin('users', 'users.id', 'app_preferences.userId')
			.select(['app_preferences.userId', 'app_preferences.data', 'users.preferences'])
			.where('app_preferences.appId', '=', 'ai')
			.where(sql<string>`app_preferences.data->'tools'->>'memory_updates'`, 'in', ['daily', 'weekly'])
			.execute();

		for (const row of rows) {
			if (!ai.Preferences.safeParse(row.data).data?.tools.memory) continue;
			await updates.enqueue({}, { key: row.userId, userId: row.userId, at: nextUpdate(1, row.preferences.time_zone) });
		}
	},
});

export async function getStatus(userId: string, running?: boolean): Promise<memory.Updates> {
	const [preferences, row, job] = await Promise.all([
		getPreferences(userId),
		database.selectFrom('ai_memory_updates').selectAll().where('userId', '=', userId).executeTakeFirst(),
		updates.get(userId),
	]);

	return {
		enabled: updatesEnabled(),
		frequency: preferences.tools.memory_updates,
		ran: row?.ran ?? null,
		summary: row?.summary ?? null,
		changes: row ? memory.ChangeIds.parse(row.changes) : null,
		next: job?.state == 'queued' ? job.runAt : null,
		running: running ?? job?.state == 'running',
	};
}

async function emitStatus(userId: string, running: boolean): Promise<void> {
	socketServer?.to('user:' + userId).emit('ai.memory_updates', await getStatus(userId, running));
}

/** Starts an update for the user now */
export async function startUpdate(userId: string): Promise<void> {
	await updates.enqueue({}, { key: userId, userId, replace: true });
}
