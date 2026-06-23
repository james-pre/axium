import { $API } from '@axium/core/api';
import { zKeys } from '@axium/core/locales';
import * as z from 'zod';

export const SystemInit = z.object({
	name: z.string().nonempty().max(250),
	hostname: z.string().nonempty().max(250),
});
export interface SystemInit extends z.infer<typeof SystemInit> {}

export const System = SystemInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	online: z.boolean(),
});
export interface System extends z.infer<typeof System> {}

export const SystemUserInit = z.object({
	name: z.string().nonempty().max(250),
	username: z.string().nonempty().max(250),
});
export interface SystemUserInit extends z.infer<typeof SystemUserInit> {}

export const SystemUser = SystemUserInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
});
export interface SystemUser extends z.infer<typeof SystemUser> {}

const SysadminAPI = {
	'users/:id/sysadmin/systems': {
		GET: System.array(),
		PUT: [SystemInit, System],
	},
	'users/:id/sysadmin/systems/shared': {
		GET: System.array(),
	},
	'users/:id/sysadmin/users': {
		GET: SystemUser.array(),
		PUT: [SystemUserInit, SystemUser],
	},
	'sysadmin/systems/:id': {
		GET: System,
		PATCH: [SystemInit, System],
	},
	'sysadmin/users/:id': {
		GET: SystemUser,
		PATCH: [SystemUserInit, SystemUser],
	},
} as const;

type SysadminAPI = typeof SysadminAPI;

declare module '@axium/core/api' {
	export interface $API extends SysadminAPI {}
}

Object.assign($API, SysadminAPI);
