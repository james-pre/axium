import type { Task, TaskList } from '@axium/tasks/common';
import * as z from 'zod';
import * as tools from '../tools.js';

function task(task: Task) {
	return {
		id: task.id,
		summary: task.summary,
		description: task.description ?? undefined,
		completed: !!task.completed,
		parent: task.parentId ?? undefined,
	};
}

function list(list: TaskList, includeCompleted: boolean) {
	const tasks = list.tasks ?? [];
	const shown = includeCompleted ? tasks : tasks.filter(task => !task.completed);
	return {
		id: list.id,
		name: list.name,
		description: list.description ?? undefined,
		shared: list.isShared,
		tasks: shown.map(task),
		...(shown.length < tasks.length && { completedHidden: tasks.length - shown.length }),
	};
}

const TaskId = z.uuid().describe("The task's ID, from list_tasks");
const Summary = z.string().min(1).max(100).describe('A short summary of the task');
const Description = z.string().max(500).describe('More details');
const Parent = z.uuid().describe('The ID of the task this one is a subtask of');

tools.add({
	name: 'list_tasks',
	description:
		"Lists the user's task lists, including ones shared with them, with their tasks. " +
		'Subtasks have the ID of their parent task. Completed tasks are left out unless asked for.',
	environment: 'account',
	access: 'read',
	input: z.object({
		list: z.uuid().optional().describe('Only this task list'),
		includeCompleted: z.boolean().optional().describe('Also list completed tasks'),
	}),
	async run({ list: listId, includeCompleted = false }, { api, userId }) {
		if (listId) return list(await api('GET', 'task_lists/:id', {}, listId), includeCompleted);
		return (await api('GET', 'users/:id/task_lists', {}, userId)).map(entry => list(entry, includeCompleted));
	},
});

tools.add({
	name: 'add_task',
	description: 'Adds a task to a task list.',
	environment: 'account',
	access: 'write',
	approval: 'allow',
	input: z.object({
		list: z.uuid().describe("The task list's ID, from list_tasks"),
		summary: Summary,
		description: Description.optional(),
		parent: Parent.optional(),
	}),
	async run({ list: listId, summary, description, parent }, { api }) {
		return task(await api('PUT', 'task_lists/:id', { summary, description, parentId: parent }, listId));
	},
});

tools.add({
	name: 'update_task',
	description: 'Changes a task, e.g. to mark it completed. Only the given fields change.',
	environment: 'account',
	access: 'write',
	input: z.object({
		id: TaskId,
		summary: Summary.optional(),
		description: Description.nullable().optional().describe('More details, or null to remove them'),
		completed: z.boolean().optional(),
		parent: Parent.nullable().optional().describe('The ID of the task this one is a subtask of, or null to make it a top-level task'),
	}),
	async run({ id, parent, ...changes }, { api }) {
		return task(await api('PATCH', 'tasks/:id', { ...changes, ...(parent !== undefined && { parentId: parent }) }, id));
	},
});

tools.add({
	name: 'delete_task',
	description: 'Deletes a task permanently.',
	environment: 'account',
	access: 'write',
	input: z.object({ id: TaskId }),
	async run({ id }, { api }) {
		const deleted = await api('DELETE', 'tasks/:id', {}, id);
		return { deleted: { id: deleted.id, summary: deleted.summary } };
	},
});

tools.add({
	name: 'create_task_list',
	description: 'Creates a task list.',
	environment: 'account',
	access: 'write',
	approval: 'allow',
	input: z.object({
		name: z.string().min(1).max(50),
		description: z.string().max(500).optional(),
	}),
	async run(init, { api, userId }) {
		const created = await api('PUT', 'users/:id/task_lists', init, userId);
		return { id: created.id, name: created.name };
	},
});
