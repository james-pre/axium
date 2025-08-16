import type { TaskList } from './common.js';

export function parseList<const T extends TaskList>(list: T): T {
	list.created = new Date(list.created);
	for (const task of list.tasks || []) {
		task.created = new Date(task.created);
		task.due = task.due ? new Date(task.due) : null;
	}
	return list;
}
