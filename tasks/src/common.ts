import type { Permission } from '@axium/core';
import type { WithRequired } from 'utilium';
import * as z from 'zod';

export const TaskInit = z.object({
	summary: z.string().max(100).default(''),
	description: z.string().max(500).optional().nullable(),
	listId: z.uuid(),
	parentId: z.uuid().optional().nullable(),
	completed: z.boolean().optional(),
	due: z.date().optional().nullable(),
});
export type TaskInit = z.infer<typeof TaskInit>;

export interface Task extends TaskInit {
	id: string;
	created: Date;
}

export const TaskListInit = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional().nullable(),
});
export type TaskListInit = z.infer<typeof TaskListInit>;

export interface TaskList extends TaskListInit {
	id: string;
	userId: string;
	created: Date;
	publicPermission: Permission;
	tasks?: Task[];
}

declare module '@axium/core/api' {
	export interface _apiTypes {
		'users/:id/task_lists': {
			GET: WithRequired<TaskList, 'tasks'>[];
			PUT: [z.input<typeof TaskListInit>, TaskList];
		};
		'task_lists/:id': {
			GET: WithRequired<TaskList, 'tasks'>;
			PATCH: [z.input<typeof TaskListInit>, TaskList];
			PUT: [Omit<z.input<typeof TaskInit>, 'listId'>, Task];
			DELETE: TaskList;
		};
		'tasks/:id': {
			PATCH: [Omit<z.input<typeof TaskInit>, 'listId'>, Task];
			DELETE: Task;
		};
	}
}
