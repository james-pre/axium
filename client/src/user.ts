import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import z from 'zod/v4';
import { fetchAPI } from './requests.js';

export async function currentSession() {
	return await fetchAPI('GET', 'session');
}

export async function login(userId: string) {
	const options = await fetchAPI('OPTIONS', 'users/:id/login', {}, userId);
	const response = await startAuthentication({ optionsJSON: options });
	await fetchAPI('POST', 'users/:id/login', response, userId);
}

export async function loginByEmail(email: string) {
	const { id: userId } = await fetchAPI('POST', 'user_id', {
		using: 'email',
		value: email,
	});
	return await login(userId);
}

export async function logoutCurrentSession() {
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

function _checkId(userId: string) {
	try {
		z.uuid().parse(userId);
	} catch (e: any) {
		throw z.prettifyError(e);
	}
}

export async function userInfo(userId: string) {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id', {}, userId);
}

export async function fullUserInfo(userId: string) {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/full', {}, userId);
}

export async function sendVerificationEmail(userId: string) {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/verify_email', {}, userId);
}

export async function verifyEmail(userId: string, token: string) {
	_checkId(userId);
	return await fetchAPI('POST', 'users/:id/verify_email', { token }, userId);
}

export async function getPasskeys(userId: string) {
	_checkId(userId);
	return await fetchAPI('GET', 'users/:id/passkeys', {}, userId);
}
