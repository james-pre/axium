import type { AuthenticatorTransportFuture, CredentialDeviceType, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import type z from 'zod/v4';
import type { RequestMethod } from './requests.js';
import type { APIUserRegistration, PasskeyAuthenticationResponse } from './schemas.js';
import type { User, UserPublic } from './user.js';

export interface Session {
	id: string;
	userId: string;
	expires: Date;
	created: Date;
}

export interface VerificationToken {
	id: string;
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
		GET: {
			session: Session;
			user: User;
		};
		DELETE: Session & { userId: string };
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
	};
	'users/:id/full': {
		GET: User & { sessions: Session[] };
	};
	'users/:id/login': {
		OPTIONS: PublicKeyCredentialRequestOptionsJSON;
		POST: [z.infer<typeof PasskeyAuthenticationResponse>, NewSessionResponse];
	};
	'users/:id/sessions': {
		GET: Session[];
		DELETE: [string, Session[]];
	};
	user_id: {
		POST: [{ using: 'email' | 'handle'; value: string }, { id: string }];
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

export type Result<Method extends RequestMethod, E extends Endpoint> = Method extends keyof _apiTypes[E]
	? _apiTypes[E][Method] extends [unknown, infer R]
		? R
		: _apiTypes[E][Method]
	: unknown;

export type APIParameters<S extends string> = S extends `${string}/:${infer Right}` ? [string, ...APIParameters<Right>] : [];
