import type { ActionFailure, RequestEvent } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import z from 'zod/v4';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FormFail<S extends z.ZodType, E extends object = object> extends ActionFailure<z.infer<S> & { error: string } & E> {}

export async function parseForm<S extends z.ZodObject, E extends object = object>(event: RequestEvent, schema: S, errorData?: E): Promise<[z.infer<S>, FormFail<S, E> | null]> {
	const formData = Object.fromEntries(await event.request.formData());
	const { data, error, success } = schema.safeParse(formData);

	if (success) return [data, null];

	return [
		data,
		fail(400, {
			...data,
			...errorData,
			error: z.prettifyError(error),
		}),
	];
}
