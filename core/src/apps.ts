import * as z from 'zod';

export const App = z.object({
	id: z.string(),
	name: z.string().optional(),
	image: z.string().optional(),
	icon: z.string().optional(),
});

export interface App extends z.infer<typeof App> {}

export const apps = new Map<string, App>();
