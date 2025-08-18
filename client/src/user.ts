import type { NewSessionResponse, Passkey, PasskeyChangeable, Session, User, UserPublic, Verification } from '@axium/core';
import { UserChangeable } from '@axium/core';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import * as z from 'zod';
import { fetchAPI } from './requests.js';

export async function login(userId: string): Promise<NewSessionResponse> {
	const options = await fetchAPI('OPTIONS', 'users/:id/auth', { type: 'login' }, userId);
	const response = await startAuthentication({ optionsJSON: options });
	return await fetchAPI('POST', 'users/:id/auth', response, userId);
}

/**
 * Create an elevated session for the user to perform sensitive actions.
 */
export async function elevate(userId: string): Promise<void> {
	const options = await fetchAPI('OPTIONS', 'users/:id/auth', { type: 'action' }, userId);
	const response = await startAuthentication({ optionsJSON: options });
	await fetchAPI('POST', 'users/:id/auth', response, userId);
}

export async function loginByEmail(email: string): Promise<NewSessionResponse> {
	const { id: userId } = await fetchAPI('POST', 'user_id', {
		using: 'email',
		value: email,
	});
	return await login(userId);
}

export async function getCurrentSession(): Promise<Session & { user: User }> {
	const result = await fetchAPI('GET', 'session');
	result.created = new Date(result.created);
	result.expires = new Date(result.expires);
	return result;
}

export async function getSessions(userId: string): Promise<Session[]> {
	_checkId(userId);
	const result = await fetchAPI('GET', 'users/:id/sessions', {}, userId);
	for (const session of result) {
		session.created = new Date(session.created);
		session.expires = new Date(session.expires);
	}
	return result;
}

export async function logout(userId: string, ...sessionId: string[]): Promise<Session[]> {
	_checkId(userId);
	const result = await fetchAPI('DELETE', 'users/:id/sessions', { id: sessionId }, userId);
	for (const session of result) {
		session.created = new Date(session.created);
		session.expires = new Date(session.expires);
	}
	return result;
}

export async function logoutAll(userId: string): Promise<Session[]> {
	_checkId(userId);
	await elevate(userId);
	const result = await fetchAPI('DELETE', 'users/:id/sessions', { confirm_all: true }, userId);
	for (const session of result) {
		session.created = new Date(session.created);
		session.expires = new Date(session.expires);
	}
	return result;
}

export async function logoutCurrentSession(): Promise<Session> {
	return await fetchAPI('DELETE', 'session');
}

export async function register(_data: Record<string, FormDataEntryValue>): Promise<void> {
	const data = z.object({ name: z.string(), email: z.email() }).parse(_data);

	const { options, userId } = await fetchAPI('OPTIONS', 'register', data);

	const response = await startRegistration({ optionsJSON: options });

	await fetchAPI('POST', 'register', {
		userId,
		name: data.name,
		email: data.email,
		response,
	});
}

function _checkId(userId: string): void {
	try {
		z.uuid().parse(userId);
	} catch (e: any) {
		throw e instanceof z.core.$ZodError ? z.prettifyError(e) : e;
	}
}

export async function userInfo(userId: string): Promise<UserPublic & Partial<User>> {
	_checkId(userId);
	const user = await fetchAPI('GET', 'users/:id', {}, userId);
	user.registeredAt = new Date(user.registeredAt);
	user.emailVerified = user.emailVerified ? new Date(user.emailVerified) : null;
	return user;
}

export async function updateUser(userId: string, data: Record<string, FormDataEntryValue>): Promise<User> {
	_checkId(userId);
	const body = await UserChangeable.parseAsync(data).catch(e => {
		throw e instanceof z.core.$ZodError ? z.prettifyError(e) : e;
	});

	const result = await fetchAPI('PATCH', 'users/:id', body, userId);
	result.registeredAt = new Date(result.registeredAt);
	if (result.emailVerified) result.emailVerified = new Date(result.emailVerified);
	return result;
}

export async function fullUserInfo(userId: string): Promise<User & { sessions: Session[] }> {
	_checkId(userId);
	const result = await fetchAPI('GET', 'users/:id/full', {}, userId);
	result.registeredAt = new Date(result.registeredAt);
	result.emailVerified = new Date(result.emailVerified!);
	return result;
}

export async function deleteUser(userId: string): Promise<User> {
	_checkId(userId);
	const options = await fetchAPI('OPTIONS', 'users/:id/auth', { type: 'action' }, userId);
	const response = await startAuthentication({ optionsJSON: options });
	await fetchAPI('POST', 'users/:id/auth', response, userId);
	const result = await fetchAPI('DELETE', 'users/:id', response, userId);
	result.registeredAt = new Date(result.registeredAt);
	result.emailVerified = new Date(result.emailVerified!);
	return result;
}

export async function emailVerificationEnabled(userId: string): Promise<boolean> {
	_checkId(userId);
	const { enabled } = await fetchAPI('OPTIONS', 'users/:id/verify_email', {}, userId);
	return enabled;
}

export async function sendVerificationEmail(userId: string): Promise<Verification> {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/verify_email', {}, userId);
}

export async function verifyEmail(userId: string, token: string): Promise<void> {
	_checkId(userId);
	await fetchAPI('POST', 'users/:id/verify_email', { token }, userId);
}

export async function getPasskeys(userId: string): Promise<Passkey[]> {
	_checkId(userId);
	const result = await fetchAPI('GET', 'users/:id/passkeys', {}, userId);
	for (const passkey of result) {
		passkey.createdAt = new Date(passkey.createdAt);
	}
	return result;
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
