import { timeSpan } from 'utilium/format';
import * as z from 'zod';
import * as ai from './common.js';
import * as tools from './tools.js';

function describe(timer: ai.Timer) {
	return {
		id: timer.id,
		label: timer.label ?? undefined,
		message: timer.message ?? undefined,
		duration: timeSpan(timer.duration * 1000, 3),
		remaining: timeSpan(new Date(timer.ends).getTime() - Date.now()),
	};
}

const Count = z.int().nonnegative().optional();

tools.add({
	name: 'set_timer',
	description: 'Starts a timer that notifies the user when it ends. Give the length using any of the duration fields.',
	environment: null,
	access: 'write',
	approval: 'allow',
	// @todo Temporal
	input: z.object({
		hours: Count,
		minutes: Count,
		seconds: Count,
		label: ai.TimerLabel.optional().describe('What the timer is for, e.g. "Pasta", shown when it ends'),
		message: ai.TimerMessage.optional().describe(
			'Shown when the timer ends, only when there is something to do or remember beyond the label, e.g. "Drain the pasta and add the sauce"'
		),
	}),
	async run({ hours = 0, minutes = 0, seconds = 0, label, message }, { timers }) {
		const duration = hours * 3600 + minutes * 60 + seconds;
		if (!duration) throw new Error('Give the length of the timer');
		if (duration > ai.maxTimerDuration) throw new Error(`Timers can be at most ${timeSpan(ai.maxTimerDuration * 1000)} long`);

		return describe(await timers.start({ label, message, duration }));
	},
});

tools.add({
	name: 'list_timers',
	description: "Lists the user's running timers with the time left on each.",
	environment: null,
	access: 'read',
	input: z.object({}),
	async run(_, { timers }) {
		const running = await timers.list();
		return running.length ? running.map(describe) : 'No timers are running.';
	},
});

tools.add({
	name: 'cancel_timer',
	description: 'Cancels a running timer.',
	environment: null,
	access: 'write',
	approval: 'allow',
	input: z.object({ id: z.uuid().describe("The timer's ID, from set_timer or list_timers") }),
	async run({ id }, { timers }) {
		return { cancelled: describe(await timers.cancel(id)) };
	},
});
