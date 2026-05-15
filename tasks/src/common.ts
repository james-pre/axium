import { $API, AccessControl, appPreferences } from '@axium/core';
import { zKeys } from '@axium/core/locales';
import * as z from 'zod';

export const TaskInit = z.object({
	summary: z.string().max(100).optional(),
	description: z.string().max(500).nullish(),
	listId: z.uuid(),
	parentId: z.uuid().nullish(),
	completed: z.boolean().optional(),
	due: z.coerce.date().nullish(),
});
export type TaskInit = z.infer<typeof TaskInit>;

export const Task = TaskInit.extend({
	id: z.uuid(),
	created: z.coerce.date(),
});

export interface Task extends z.infer<typeof Task> {}

export type TreeStatus = 'completed' | 'pending' | null;

export interface TaskTreeNode {
	task: Task;
	children: TaskTreeNode[];
	all: TreeStatus;
}

export function fillAllStatus(node: TaskTreeNode, force: boolean = false): TreeStatus {
	if (node.all && !force) return node.all;

	let all: TreeStatus = node.task.completed ? 'completed' : 'pending';

	for (const child of node.children) {
		const childStatus = fillAllStatus(child, force);
		if (!childStatus || childStatus !== all) all = null;
	}

	node.all = all;
	return all;
}

export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
	const nodes = new Map<string, TaskTreeNode>();
	const roots: TaskTreeNode[] = [];

	for (const task of tasks) nodes.set(task.id, { task, children: [], all: null });

	for (const task of tasks) {
		const node = nodes.get(task.id)!;
		if (task.parentId) nodes.get(task.parentId)?.children.push(node);
		else roots.push(node);
	}

	for (const node of roots) fillAllStatus(node);

	return roots;
}

export const TaskListInit = z.object({
	name: z.string().min(1).max(50),
	description: z.string().max(500).nullish(),
});
export type TaskListInit = z.infer<typeof TaskListInit>;

export const TaskListUpdate = z.object({
	all_completed: z.boolean().optional(),
});
export type TaskListUpdate = z.infer<typeof TaskListUpdate>;

export const TaskList = TaskListInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	created: z.coerce.date(),
	tasks: Task.array().optional(),
	isShared: z.boolean(),
	acl: AccessControl.array(),
});

export interface TaskList extends z.infer<typeof TaskList> {}

export const TasksPreferences = z
	.object({
		show_completed_subtasks: z
			.literal(['inline', 'mirror'])
			.default('inline')
			.register(zKeys, { prefix: 'tasks.show_completed_subtasks' }),
	})
	.register(zKeys, { prefix: 'tasks.preferences' });

appPreferences.set('tasks', TasksPreferences);

import type {} from '@axium/core/apps';
declare module '@axium/core/apps' {
	interface $AppPreferences {
		tasks: typeof TasksPreferences;
	}
}

const TasksAPI = {
	'users/:id/task_lists': {
		GET: TaskList.required({ tasks: true }).array(),
		PUT: [TaskListInit, TaskList],
	},
	'task_lists/:id': {
		GET: TaskList.required({ tasks: true }),
		PATCH: [TaskListInit, TaskList],
		POST: [TaskListUpdate, z.unknown()],
		PUT: [TaskInit.omit({ listId: true }), Task],
		DELETE: TaskList,
	},
	'tasks/:id': {
		PATCH: [TaskInit.omit({ listId: true }), Task],
		DELETE: Task,
	},
} as const;

type TasksAPI = typeof TasksAPI;

declare module '@axium/core/api' {
	export interface $API extends TasksAPI {}
}

Object.assign($API, TasksAPI);
