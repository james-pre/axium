import { $API } from '@axium/core/api';
import { addClientToServer, addServerToClient } from '@axium/core/socket';
import * as z from 'zod';
import { SystemInfo } from './info.js';

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

export const SystemPing = z.object({
	hostname: z.string(),
	username: z.string(),
});
export interface SystemPing extends z.infer<typeof SystemPing> {}

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

const SysadminClientToServer = {
	'sysadmin:getSystemInfo': [[SystemInfo.array()]],
	'sysadmin:ping': [[SystemPing.array()]],
} as const;

const SysadminServerToClient = {
	'sysadmin:getSystemInfo': [[SystemInfo]],
	'sysadmin:ping': [[SystemPing]],
} as const;

declare module '@axium/core/socket' {
	export interface ClientToServer extends ParseTuples<typeof SysadminClientToServer> {}
	export interface ServerToClient extends ParseFunctions<typeof SysadminServerToClient> {}
}

addClientToServer(SysadminClientToServer);
addServerToClient(SysadminServerToClient);
