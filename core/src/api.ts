import type {
	AuthenticatorTransportFuture,
	CredentialDeviceType,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import type z from 'zod';
import type { RequestMethod } from './requests.js';
import type {
	APIUserRegistration,
	LogoutSessions,
	PasskeyAuthenticationResponse,
	PasskeyChangeable,
	PasskeyRegistration,
	UserAuthOptions,
} from './schemas.js';
import type { User, UserChangeable, UserPublic } from './user.js';
import type { AccessControl } from './access.js';

export interface Session {
	id: string;
	userId: string;
	expires: Date;
	created: Date;
	elevated: boolean;
}

export interface Verification {
	userId: string;
	expires: Date;
}

export interface Passkey {
	id: string;
	name?: string | null;
	createdAt: Date;
	userId: string;
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports: AuthenticatorTransportFuture[];
}

export interface NewSessionResponse {
	userId: string;
	token: string;
}

/**
 * Types for all API endpoints
 * @internal
 */
export interface _apiTypes {
	metadata: {
		GET: {
			version: string;
			routes: Record<string, { params: Record<string, string | null>; methods: string[] }>;
			plugins: Record<string, string>;
		};
	};
	session: {
		GET: Session & { user: User };
		DELETE: Session;
	};
	register: {
		OPTIONS: {
			userId: string;
			options: PublicKeyCredentialCreationOptionsJSON;
		};
		POST: [z.input<typeof APIUserRegistration>, NewSessionResponse];
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
	'users/:id/verify_email': {
		OPTIONS: { enabled: boolean };
		GET: Verification;
		POST: [{ token: string }, {}];
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
		PUT: [{ userId: string; permission: number }, AccessControl];
	};
}

export type Endpoint = keyof _apiTypes;

export type APIFunction<Method extends RequestMethod, E extends Endpoint> = Method extends keyof _apiTypes[E]
	? _apiTypes[E][Method] extends [infer Body, infer Result]
		? (body: Body) => Promise<Result>
		: () => _apiTypes[E][Method]
	: unknown;

export type RequestBody<Method extends RequestMethod, E extends Endpoint> = Method extends keyof _apiTypes[E]
	? _apiTypes[E][Method] extends [infer Body, unknown]
		? Body
		: any
	: unknown;

export type Result<Method extends RequestMethod, E extends Endpoint> = Promise<
	Method extends keyof _apiTypes[E] ? (_apiTypes[E][Method] extends [unknown, infer R] ? R : _apiTypes[E][Method]) : unknown
>;

export type APIParameters<S extends string> = S extends `${string}/:${infer Right}` ? [string, ...APIParameters<Right>] : [];
