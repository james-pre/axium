import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import z from 'zod/v4';
import { fetchAPI } from './requests.js';

export async function session() {
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

export async function logout() {
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

export async function userInfo(userId: string) {
	try {
		z.uuid().parse(userId);
	} catch (e: any) {
		throw z.prettifyError(e);
	}
	return await fetchAPI('GET', 'users/:id', {}, userId);
}

export async function fullUserInfo(userId: string) {
	try {
		z.uuid().parse(userId);
	} catch (e: any) {
		throw z.prettifyError(e);
	}
	return await fetchAPI('GET', 'users/:id/full', {}, userId);
}
