import { count } from '@axium/server/database';
import './common.js';
import './server.js';

export async function statusText(): Promise<string> {
	const { tasks, task_lists } = await count('tasks', 'task_lists');

	return `${tasks} tasks, ${task_lists} lists`;
}
