import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import type z from 'zod/v4';
import type { RequestMethod } from './requests.js';
import type { APILogin, APIUserRegistration } from './schemas.js';
import type { UserProtected, UserPublic } from './user.js';

export interface SessionInfo {
	id: string;
	expires: Date;
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
			session: SessionInfo;
			user: UserProtected;
		};
		DELETE: SessionInfo & { userId: string };
	};
	register: {
		OPTIONS: {
			userId: string;
			options: PublicKeyCredentialCreationOptionsJSON;
		};
		POST: [z.input<typeof APIUserRegistration>, NewSessionResponse];
	};
	'users/:id': {
		GET: UserPublic & Partial<UserProtected>;
	};
	'users/:id/login': {
		OPTIONS: PublicKeyCredentialRequestOptionsJSON;
		POST: [z.infer<typeof APILogin>, NewSessionResponse];
	};
	'users/:id/sessions': {
		GET: SessionInfo[];
		DELETE: [string, SessionInfo[]];
	};
	'users/from-session': {
		GET: UserProtected & { sessions: SessionInfo[] };
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
