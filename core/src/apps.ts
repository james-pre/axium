import type { ConstMap } from 'utilium';
import * as z from 'zod';

export const App = z.object({
	id: z.string(),
	name: z.string().optional(),
	image: z.string().optional(),
	icon: z.string().optional(),
});

export interface App extends z.infer<typeof App> {}

export const apps = new Map<string, App>();

/** Declaration-merge to add types */
export interface $AppPreferences {}

export type AppPreferences<K extends string> = K extends keyof $AppPreferences ? z.infer<$AppPreferences[K]> : object;

export const appPreferences = new Map<string, z.ZodObject>() as ConstMap<$AppPreferences & { [K: string]: z.ZodObject }>;
