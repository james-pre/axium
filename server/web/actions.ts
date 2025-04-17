import { Registration, User } from '@axium/core/schemas';
import type { RequestEvent } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { adapter, register } from '../dist/auth.js';
import { parseForm } from './utils.js';

export async function editEmail(event: RequestEvent) {
	const session = await event.locals.auth();
	if (!session) return fail(401, { error: 'You are not signed in' });

	const [{ email } = {}, error] = await parseForm(event, User.pick({ email: true }));
	if (error) return error;

	const user = await adapter.getUserByEmail(session.user.email);
	if (!user) return fail(401, { email, error: 'You are not signed in' });

	try {
		await adapter.updateUser({ id: user.id, email, image: user.image });
	} catch (error: any) {
		return fail(400, { email, error: typeof error === 'string' ? error : error.message });
	}
	return { success: true };
}

export async function editName(event: RequestEvent) {
	const session = await event.locals.auth();
	if (!session) return fail(401, { error: 'You are not signed in' });

	const [{ name } = {}, error] = await parseForm(event, User.pick({ name: true }));
	if (error) return error;

	const user = await adapter.getUserByEmail(session.user.email);
	if (!user) return fail(401, { name, error: 'You are not signed in' });

	try {
		await adapter.updateUser({ id: user.id, name, image: user.image });
	} catch (error: any) {
		return fail(400, { name, error: typeof error === 'string' ? error : error.message });
	}
	return { success: true };
}

export async function signup(event: RequestEvent) {
	const [data, error] = await parseForm(event, Registration);
	if (error) return error;

	try {
		const { session } = await register(data);
		event.cookies.set('session', session.sessionToken, {
			path: '/',
			expires: session.expires,
			httpOnly: true,
		});
		return { ...data, success: true, data: session.sessionToken };
	} catch (error: any) {
		return fail(400, { ...data, error: typeof error === 'string' ? error : error.message });
	}
}
