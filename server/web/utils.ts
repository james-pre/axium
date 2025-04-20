import type { Session } from '@auth/sveltekit';
import type { ActionFailure, RequestEvent } from '@sveltejs/kit';
import { fail, redirect } from '@sveltejs/kit';
import type * as z from 'zod';
import { fromError } from 'zod-validation-error';
import config from '../dist/config.js';

export async function loadSession(event: RequestEvent): Promise<{ session: Session }> {
	const session = await event.locals.auth();
	if (!session) redirect(307, '/auth/signin');
	if (!session.user.name && event.url.pathname != config.web.prefix + '/name') redirect(307, config.web.prefix + '/name');
	return { session };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FormFail<S extends z.AnyZodObject, E extends object = object> extends ActionFailure<z.infer<S> & { error: string } & E> {}

export async function parseForm<S extends z.AnyZodObject, E extends object = object>(event: RequestEvent, schema: S, errorData?: E): Promise<[z.infer<S>, FormFail<S, E> | null]> {
	const formData = Object.fromEntries(await event.request.formData());
	const { data, error, success } = schema.safeParse(formData);

	if (success) return [data, null];

	return [
		data,
		fail(400, {
			...data,
			...errorData,
			error: fromError(error, { prefix: null }).toString(),
		}),
	];
}
