import type {
	AuthInfo,
	NewSessionResponse,
	Passkey,
	PasskeyChangeable,
	Session,
	User,
	UserChangeable,
	UserPublic,
	Verification,
} from '@axium/core';
import { UserRegistrationInit } from '@axium/core/user';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import * as z from 'zod';
import Cache from './cache.js';
import { fetchAPI } from './requests.js';

export async function login(userId: string): Promise<NewSessionResponse> {
	const options = await fetchAPI('PUT', 'users/:id/auth', { type: 'login' }, userId);
	const response = await startAuthentication({ optionsJSON: options });
	return await fetchAPI('POST', 'users/:id/auth', response, userId);
}

/**
 * Create an elevated session for the user to perform sensitive actions.
 */
export async function elevate(userId: string): Promise<void> {
	const options = await fetchAPI('PUT', 'users/:id/auth', { type: 'action' }, userId);
	const response = await startAuthentication({ optionsJSON: options });
	await fetchAPI('POST', 'users/:id/auth', response, userId);
}

export async function loginByUsername(username: string): Promise<NewSessionResponse> {
	const { id: userId } = await fetchAPI('POST', 'user_id', { using: 'username', value: username });
	return await login(userId);
}

let _currentSession: (Session & { user: User }) | null = null;

export async function getCurrentSession(): Promise<Session & { user: User }> {
	_currentSession ||= await fetchAPI('GET', 'session');
	return _currentSession;
}

export async function getSessions(userId: string): Promise<Session[]> {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/sessions', {}, userId);
}

export async function logout(userId: string, ...sessionId: string[]): Promise<Session[]> {
	_checkId(userId);
	return await fetchAPI('DELETE', 'users/:id/sessions', { id: sessionId }, userId);
}

export async function logoutAll(userId: string): Promise<Session[]> {
	_checkId(userId);
	await elevate(userId);
	return await fetchAPI('DELETE', 'users/:id/sessions', { confirm_all: true }, userId);
}

export async function logoutCurrentSession(): Promise<Session> {
	return await fetchAPI('DELETE', 'session');
}

export async function register(_data: Record<string, unknown>): Promise<void> {
	const data = UserRegistrationInit.parse(_data);

	const { options, userId } = await fetchAPI('PUT', 'register', data);

	const response = await startRegistration({ optionsJSON: options });

	await fetchAPI('POST', 'register', { userId, response, ...data });
}

function _checkId(userId: string): void {
	try {
		z.uuid().parse(userId);
	} catch (e: any) {
		throw e instanceof z.core.$ZodError ? z.prettifyError(e) : e;
	}
}

const userCache = new Cache<[string], UserPublic>((userId: string) => fetchAPI('GET', 'users/:id', {}, userId), { ttl: 86400_000 });

export { userCache as apiUserCache };

export async function userInfo(userId: string): Promise<UserPublic> {
	_checkId(userId);
	return await userCache.get(userId);
}

export async function updateUser(userId: string, data: UserChangeable | Record<string, FormDataEntryValue>): Promise<User> {
	_checkId(userId);
	const result = await fetchAPI('PATCH', 'users/:id', data, userId);
	userCache.set(userId, result);
	return result;
}

export async function fullUserInfo(userId: string): Promise<User & { sessions: Session[] }> {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/full', {}, userId);
}

/**
 * @param userId The UUID of the user to delete
 * @param deletingId The UUID of the user performing the deletion (for authentication). Defaults to userId.
 */
export async function deleteUser(userId: string, deletingId: string = userId): Promise<User> {
	_checkId(userId);
	const options = await fetchAPI('PUT', 'users/:id/auth', { type: 'action' }, deletingId);
	const response = await startAuthentication({ optionsJSON: options });
	await fetchAPI('POST', 'users/:id/auth', response, deletingId);
	const result = await fetchAPI('DELETE', 'users/:id', response, userId);
	userCache.invalidate(userId);
	return result;
}

/**
 * Get which authentication-related features are available, e.g. account recovery methods.
 */
export async function getAuthInfo(userId: string): Promise<AuthInfo> {
	_checkId(userId);
	return await fetchAPI('OPTIONS', 'users/:id/auth', {}, userId);
}

export async function sendVerificationEmail(userId: string): Promise<Verification> {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/verify/email', {}, userId);
}

export async function verifyEmail(userId: string, token: string): Promise<void> {
	_checkId(userId);
	await fetchAPI('POST', 'users/:id/verify/email', { token }, userId);
}

export async function getPasskeys(userId: string): Promise<Passkey[]> {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/passkeys', {}, userId);
}

/**
 * Create a new passkey for an existing user.
 */
export async function createPasskey(userId: string): Promise<Passkey> {
	_checkId(userId);
	const options = await fetchAPI('OPTIONS', 'users/:id/passkeys', {}, userId);

	const response = await startRegistration({ optionsJSON: options });

	return await fetchAPI('PUT', 'users/:id/passkeys', response, userId);
}

export async function updatePasskey(passkeyId: string, data: z.input<typeof PasskeyChangeable>): Promise<Passkey> {
	return await fetchAPI('PATCH', 'passkeys/:id', data, passkeyId);
}

export async function deletePasskey(passkeyId: string): Promise<Passkey> {
	return await fetchAPI('DELETE', 'passkeys/:id', {}, passkeyId);
}
