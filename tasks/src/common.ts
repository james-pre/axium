import { $API } from '@axium/core';
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
});

export interface TaskList extends z.infer<typeof TaskList> {}

const TasksAPI = {
	'users/:id/task_lists': {
		GET: TaskList.required({ tasks: true }).array(),
		PUT: [TaskListInit, TaskList],
	},
	'task_lists/:id': {
		GET: TaskList.required({ tasks: true }),
		PATCH: [TaskListInit, TaskList],
		POST: [TaskListUpdate, {}],
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
