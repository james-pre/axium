import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import type { Omit } from 'utilium';
import type z from 'zod';
import type { AccessControl, AccessMap } from './access.js';
import type { App } from './apps.js';
import type { AuditEvent, AuditFilter, Severity } from './audit.js';
import type { NewSessionResponse, Session, Verification, VerificationInternal } from './auth.js';
import type { PackageVersionInfo } from './packages.js';
import type { Passkey, PasskeyAuthenticationResponse, PasskeyChangeable, PasskeyRegistration } from './passkeys.js';
import type { PluginInternal } from './plugins.js';
import type { RequestMethod } from './requests.js';
import type {
	LogoutSessions,
	User,
	UserAuthOptions,
	UserChangeable,
	UserInternal,
	UserPublic,
	UserRegistration,
	UserRegistrationInit,
} from './user.js';

export interface AdminSummary {
	users: number;
	passkeys: number;
	sessions: number;
	auditEvents: Record<keyof typeof Severity, number>;
	configFiles: number;
	plugins: number;
	versions: Record<'core' | 'server' | 'client', PackageVersionInfo>;
}

/**
 * Types for all API endpoints
 * @internal
 */
export interface $API {
	metadata: {
		GET: {
			versions: PackageVersionInfo[];
			routes: Record<string, { params: Record<string, string | null>; methods: string[] }>;
		};
	};
	apps: {
		GET: App[];
	};
	session: {
		GET: Session & { user: User };
		DELETE: Session;
	};
	register: {
		OPTIONS: [z.input<typeof UserRegistrationInit>, { userId: string; options: PublicKeyCredentialCreationOptionsJSON }];
		POST: [z.input<typeof UserRegistration>, NewSessionResponse];
	};
	'users/:id': {
		GET: UserPublic & Partial<User>;
		PATCH: [z.input<typeof UserChangeable>, User];
		DELETE: User;
	};
	'users/:id/full': {
		GET: User & { sessions: Session[] };
	};
	'users/:id/auth': {
		OPTIONS: [z.input<typeof UserAuthOptions>, PublicKeyCredentialRequestOptionsJSON];
		POST: [z.input<typeof PasskeyAuthenticationResponse>, NewSessionResponse];
	};
	'users/:id/sessions': {
		GET: Session[];
		DELETE: [z.input<typeof LogoutSessions>, Session[]];
	};
	'users/:id/passkeys': {
		OPTIONS: PublicKeyCredentialCreationOptionsJSON;
		GET: Passkey[];
		PUT: [z.input<typeof PasskeyRegistration>, Passkey];
	};
	'users/:id/verify/email': {
		OPTIONS: { enabled: boolean };
		GET: Verification;
		POST: [{ token: string }, {}];
	};
	'users/:id/verify/login': {
		POST: [{ token: string }, NewSessionResponse];
	};
	'passkeys/:id': {
		GET: Passkey;
		PATCH: [z.input<typeof PasskeyChangeable>, Passkey];
		DELETE: Passkey;
	};
	user_id: {
		POST: [{ using: 'email' | 'handle'; value: string }, { id: string }];
	};
	'acl/:itemType/:itemId': {
		GET: AccessControl[];
		POST: [AccessMap, AccessControl[]];
	};
	'admin/summary': {
		GET: AdminSummary;
	};
	'admin/users/all': {
		GET: UserInternal[];
	};
	'admin/users/:userId': {
		GET: UserInternal & { sessions: Session[] };
		DELETE: UserInternal;
	};
	'admin/users': {
		PUT: [{ name: string; email: string }, VerificationInternal];
	};
	'admin/config': {
		GET: {
			files: Record<string, object>;
			config: Record<string, unknown>;
		};
	};
	'admin/plugins': {
		GET: (Omit<PluginInternal, '_hooks' | '_client'> & PackageVersionInfo)[];
	};
	'admin/audit/events': {
		OPTIONS: { name: string[]; source: string[]; tags: string[] } | false;
		GET: [filter: z.input<typeof AuditFilter>, result: AuditEvent[]];
	};
	'admin/audit/:eventId': {
		GET: AuditEvent;
	};
}

export type Endpoint = keyof $API;

export type APIFunction<Method extends RequestMethod, E extends Endpoint> = Method extends keyof $API[E]
	? $API[E][Method] extends [infer Body, infer Result]
		? (body: Body) => Promise<Result>
		: () => $API[E][Method]
	: unknown;

export type RequestBody<Method extends RequestMethod, E extends Endpoint> = Method extends keyof $API[E]
	? $API[E][Method] extends [infer Body, unknown]
		? Body
		: any
	: unknown;

export type Result<Method extends RequestMethod & keyof $API[E], E extends Endpoint> = $API[E][Method] extends [unknown, infer R]
	? R
	: $API[E][Method];

export type AsyncResult<Method extends RequestMethod & keyof $API[E], E extends Endpoint> = Promise<Result<Method, E>>;

export type APIParameters<S extends string> = S extends `${string}/:${infer Right}` ? [string, ...APIParameters<Right>] : [];
