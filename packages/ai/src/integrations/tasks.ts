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

/** Finds a task list by ID or name, ignoring case for names */
async function findList({ api, userId }: tools.Context, idOrName: string): Promise<TaskList> {
	const lists = await api('GET', 'users/:id/task_lists', {}, userId);
	const name = idOrName.trim().toLowerCase();
	const found = lists.find(list => list.id == idOrName) ?? lists.find(list => list.name.trim().toLowerCase() == name);
	if (found) return found;

	const available = lists.map(list => `"${list.name}"`).join(', ') || 'none';
	throw new Error(`No task list has the ID or name "${idOrName}". The user's task lists: ${available}`);
}

/** Finds a task by ID, explaining what went wrong when the ID belongs to something else */
async function findTask({ api, userId }: tools.Context, id: string): Promise<Task> {
	const lists = await api('GET', 'users/:id/task_lists', {}, userId);

	for (const list of lists) {
		const found = list.tasks.find(task => task.id == id);
		if (found) return found;
	}

	const list = lists.find(list => list.id == id);
	if (list) throw new Error(`${id} is the ID of the task list "${list.name}", not a task. Use the task list tools for lists.`);

	throw new Error(`No task has the ID ${id}. Use list_tasks to find the task.`);
}

const TaskId = z.uuid().describe("The task's ID, from list_tasks");
const List = z.string().min(1).max(100).describe("The task list's ID or exact name");
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
		list: List.optional().describe('Only this task list, by ID or exact name'),
		includeCompleted: z.boolean().optional().describe('Also list completed tasks'),
	}),
	async run({ list: idOrName, includeCompleted = false }, context) {
		if (idOrName) return list(await findList(context, idOrName), includeCompleted);
		return (await context.api('GET', 'users/:id/task_lists', {}, context.userId)).map(entry => list(entry, includeCompleted));
	},
});

tools.add({
	name: 'add_task',
	description: 'Adds a task to a task list.',
	environment: 'account',
	access: 'write',
	approval: 'allow',
	input: z.object({
		list: List,
		summary: Summary,
		description: Description.optional(),
		parent: Parent.optional(),
	}),
	async run({ list: idOrName, summary, description, parent }, context) {
		const { id } = await findList(context, idOrName);
		return task(await context.api('PUT', 'task_lists/:id', { summary, description, parentId: parent }, id));
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
	async run({ id, parent, ...changes }, context) {
		await findTask(context, id);
		return task(await context.api('PATCH', 'tasks/:id', { ...changes, ...(parent !== undefined && { parentId: parent }) }, id));
	},
});

tools.add({
	name: 'delete_task',
	description: 'Deletes a task permanently. To delete a whole task list, use delete_task_list.',
	environment: 'account',
	access: 'write',
	input: z.object({ id: TaskId }),
	async run({ id }, context) {
		await findTask(context, id);
		const deleted = await context.api('DELETE', 'tasks/:id', {}, id);
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

tools.add({
	name: 'update_task_list',
	description: 'Renames a task list or changes its description. Only the given fields change.',
	environment: 'account',
	access: 'write',
	input: z.object({
		list: List,
		name: z.string().min(1).max(50).optional().describe('The new name'),
		description: z.string().max(500).nullable().optional().describe('The new description, or null to remove it'),
	}),
	async run({ list: idOrName, ...changes }, context) {
		const existing = await findList(context, idOrName);
		const { name, description } = { name: existing.name, description: existing.description, ...changes };
		const updated = await context.api('PATCH', 'task_lists/:id', { name, description }, existing.id);
		return { id: updated.id, name: updated.name, description: updated.description ?? undefined };
	},
});

tools.add({
	name: 'delete_task_list',
	description: 'Deletes a task list and all of its tasks permanently.',
	environment: 'account',
	access: 'write',
	input: z.object({ list: List }),
	async run({ list: idOrName }, context) {
		const { id } = await findList(context, idOrName);
		const deleted = await context.api('DELETE', 'task_lists/:id', {}, id);
		return { deleted: { id: deleted.id, name: deleted.name } };
	},
});
