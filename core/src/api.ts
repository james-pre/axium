import type { Add, Tuple } from 'utilium';
import * as z from 'zod';
import { AccessControl, AccessMap } from './access.js';
import { App } from './apps.js';
import { AuditEvent, AuditFilter, Severity } from './audit.js';
import { NewSessionResponse, Session, Verification, VerificationInternal } from './auth.js';
import { PackageVersionInfo } from './packages.js';
import {
	Passkey,
	PasskeyAuthOptions,
	PasskeyAuthResponse,
	PasskeyChangeable,
	PasskeyCreationOptions,
	PasskeyRegistration,
} from './passkeys.js';
import { PluginInternal } from './plugins.js';
import type { RequestMethod } from './requests.js';
import { LogoutSessions, User, UserAuthOptions, UserChangeable, UserPublic, UserRegistration, UserRegistrationInit } from './user.js';

export const AdminSummary = z.object({
	users: z.number(),
	passkeys: z.number(),
	sessions: z.number(),
	auditEvents: z.tuple(Array(Severity.Debug + 1).fill(z.number()) as Tuple<z.ZodNumber, Add<typeof Severity.Debug, 1>>),
	configFiles: z.number(),
	plugins: z.number(),
	versions: z.record(z.literal(['core', 'server', 'client']), PackageVersionInfo),
});

/**
 * Schemas for all API endpoints
 * @internal
 */
const _API = {
	metadata: {
		GET: z.object({
			versions: PackageVersionInfo.array(),
			routes: z.record(z.string(), z.object({ params: z.record(z.string(), z.string().nullable()), methods: z.string().array() })),
		}),
	},
	apps: {
		GET: App.array(),
	},
	session: {
		GET: z.object({ ...Session.shape, user: User }),
		DELETE: Session,
	},
	register: {
		OPTIONS: [UserRegistrationInit, z.object({ userId: z.uuid(), options: PasskeyCreationOptions })],
		POST: [UserRegistration, NewSessionResponse],
	},
	'users/:id': {
		GET: UserPublic,
		PATCH: [UserChangeable, User],
		DELETE: User,
	},
	'users/:id/full': {
		GET: User.extend({ sessions: Session.array() }),
	},
	'users/:id/auth': {
		OPTIONS: [UserAuthOptions, PasskeyAuthOptions],
		POST: [PasskeyAuthResponse, NewSessionResponse],
	},
	'users/:id/sessions': {
		GET: Session.array(),
		DELETE: [LogoutSessions, Session.array()],
	},
	'users/:id/passkeys': {
		OPTIONS: PasskeyCreationOptions,
		GET: Passkey.array(),
		PUT: [PasskeyRegistration, Passkey],
	},
	'users/:id/verify/email': {
		OPTIONS: z.object({ enabled: z.boolean() }),
		GET: Verification,
		POST: [z.object({ token: z.string() }), z.object({})],
	},
	'users/:id/verify/login': {
		POST: [z.object({ token: z.string() }), NewSessionResponse],
	},
	'passkeys/:id': {
		GET: Passkey,
		PATCH: [PasskeyChangeable, Passkey],
		DELETE: Passkey,
	},
	user_id: {
		POST: [z.object({ using: z.literal(['email', 'handle']), value: z.string() }), z.object({ id: z.uuid() })],
	},
	'acl/:itemType/:itemId': {
		GET: AccessControl.array(),
		POST: [AccessMap, AccessControl.array()],
	},
	'admin/summary': {
		GET: AdminSummary,
	},
	'admin/users': {
		GET: User.array(),
		PUT: [z.object({ name: z.string(), email: z.email() }), z.object({ user: User, verification: VerificationInternal })],
	},
	'admin/config': {
		GET: z.object({
			files: z.record(z.string(), z.any()),
			config: z.record(z.string(), z.unknown()),
		}),
	},
	'admin/plugins': {
		GET: z.object({ ...PluginInternal.omit({ _hooks: true, _client: true }).shape, ...PackageVersionInfo.shape }).array(),
	},
	'admin/audit/events': {
		OPTIONS: z.object({ name: z.string().array(), source: z.string().array(), tags: z.string().array() }).or(z.literal(false)),
		GET: [AuditFilter, AuditEvent.array()],
	},
	'admin/audit/:eventId': {
		GET: AuditEvent,
	},
} as const satisfies Record<string, { [K in RequestMethod]?: z.ZodType | [z.ZodType, z.ZodType] }>;

type _API = typeof _API;
export interface $API extends _API {}
export const $API = _API as $API;

export type APIValues = {
	[Endpoint in keyof $API]: {
		[Method in keyof $API[Endpoint]]: $API[Endpoint][Method] extends readonly [
			infer Body extends z.ZodType,
			infer Result extends z.ZodType,
		]
			? [z.input<Body>, z.infer<Result>]
			: $API[Endpoint][Method] extends z.ZodType
				? z.infer<$API[Endpoint][Method]>
				: never;
	};
};

export type Endpoint = keyof $API;

export type APIFunction<Method extends RequestMethod & keyof $API[E], E extends Endpoint> = Method extends keyof APIValues[E]
	? APIValues[E][Method] extends [infer Body, infer Result]
		? (body: Body) => Promise<Result>
		: () => APIValues[E][Method]
	: unknown;

export type RequestBody<Method extends RequestMethod & keyof $API[E], E extends Endpoint> = Method extends keyof APIValues[E]
	? APIValues[E][Method] extends [infer Body, unknown]
		? Body
		: any
	: unknown;

export type Result<Method extends RequestMethod & keyof APIValues[E], E extends Endpoint> = APIValues[E][Method] extends [unknown, infer R]
	? R
	: APIValues[E][Method];

export type AsyncResult<Method extends RequestMethod & keyof APIValues[E], E extends Endpoint> = Promise<Result<Method, E>>;

export type APIParameters<S extends string> = S extends `${string}/:${infer Right}` ? [string, ...APIParameters<Right>] : [];
